import { expect, test } from 'bun:test';
import { compileWithManifest, MappingProfileSchema } from '../../compiler/src';
import { generateSite, type SiteOptions } from '../src';
const directory = new URL('../../../fixtures/schnitzler-diary/', import.meta.url);
const manifest = await Bun.file(new URL('manifest.json', directory)).json();
const sources = await Promise.all(Object.keys(manifest.files).filter(name => name.endsWith('.xml')).map(async name => ({ name, xml: await Bun.file(new URL(name, directory)).text() })));
const profile = MappingProfileSchema.parse(await Bun.file(new URL('mapping.json', directory)).json());
const bundle = compileWithManifest(sources, profile.mapping);
const options: SiteOptions = { title: 'Diary <study>', attribution: 'Attribution & rights', basePath: '/diary/', sourceLinks: { [sources[0].name]: 'https://example.test/source.xml' } };

function checkLinks(files: Map<string, string>, basePath: string) {
    for (const [name, html] of files) {
        if (!name.endsWith('.html')) continue;
        const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
        expect(new Set(ids).size).toBe(ids.length);
        for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
            const url = match[1]; if (/^https?:/.test(url)) continue;
            const [path, fragment] = url.split('#');
            expect(path === '' || path.startsWith(basePath)).toBe(true);
            const target = path ? path.slice(basePath.length) : name;
            expect(files.has(target)).toBe(true);
            if (fragment) expect(files.get(target)).toContain(`id="${fragment}"`);
        }
    }
}

test('all generated links, assets, and occurrence fragments resolve at root and under a subpath', async () => {
    for (const basePath of ['/', '/diary/']) {
        const files = await generateSite(bundle.edition, bundle.manifest, { ...options, basePath });
        expect(files.size).toBe(32); checkLinks(files, basePath);
        const documentPages = [...files].filter(([name]) => name.startsWith('document-'));
        expect(documentPages).toHaveLength(3);
        expect(documentPages.every(([, html]) => html.includes('(as written)'))).toBe(true);
        expect(files.get('index.html')).toContain('1909-06-10');
        expect(files.get('entities.html')).toContain('Richard (as written)');
        expect([...files.values()].join('')).not.toContain('Canonical label unavailable');
        expect(files.get('index.html')).toContain('Diary &lt;study&gt;');
        expect(files.get('diagnostics.html')).toContain('0 compiler diagnostics');
        expect([...files.values()].join('')).not.toContain('fetch(');
    }
});

test('document and entity URLs and passage anchors stay stable when the corpus is reordered', async () => {
    const original = await generateSite(bundle.edition, bundle.manifest, options);
    const reorderedBundle = compileWithManifest([...sources].reverse(), profile.mapping);
    const reordered = await generateSite(reorderedBundle.edition, reorderedBundle.manifest, options);
    expect([...original.keys()].sort()).toEqual([...reordered.keys()].sort());
    const passageIds = (files: Map<string, string>) => [...files].filter(([name]) => name.startsWith('document-')).flatMap(([, html]) => [...html.matchAll(/\bid="(record-[^"]+)"/g)].map(match => match[1])).sort();
    expect(passageIds(original)).toEqual(passageIds(reordered));
});

test('binding, publication URLs and base path are checked before output', async () => {
    await expect(generateSite(bundle.edition, { ...bundle.manifest, editionSha256: '0'.repeat(64) }, options)).rejects.toThrow('does not match');
    for (const basePath of ['relative/', '/bad/../', '/"unsafe/']) await expect(generateSite(bundle.edition, bundle.manifest, { ...options, basePath })).rejects.toThrow('Base path');
    for (const sourceLinks of [{ missing: 'https://example.test/' }, { [sources[0].name]: 'javascript:alert(1)' }]) await expect(generateSite(bundle.edition, bundle.manifest, { ...options, sourceLinks })).rejects.toThrow('source link');
});

test('notes, interventions and nontextual documents remain renderable without source loading', async () => {
    const other = compileWithManifest([{ name: 'example.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="example"><teiHeader/><text><body><div type="prose">A<del>B</del><add>C</add><note>Note &lt;script&gt;<hi>emphasis</hi></note></div><div type="photo"/></body></text></TEI>' }], { partKinds: { prose: 'prose', photo: 'photograph' }, entityKinds: {} });
    const files = await generateSite(other.edition, other.manifest, { ...options, sourceLinks: undefined });
    const document = [...files].find(([name]) => name.startsWith('document-'))![1];
    expect(document).toContain('class="deletion">B');
    expect(document).toContain('class="insertion">C');
    expect(document).toContain('Note &lt;script&gt;');
    expect(document).toContain('<h2>Photograph</h2>');
    checkLinks(files, options.basePath);
});

test('paired letter notes have working source-point backlinks and cross-edition routes', async () => {
    const letterDirectory = new URL('../../../fixtures/schnitzler-letters/', import.meta.url);
    const pairedProfile = MappingProfileSchema.parse(await Bun.file(new URL('mapping.json', letterDirectory)).json());
    const paired = compileWithManifest([
        ...sources.map(source => ({ ...source, uri: 'https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-tagebuch/editions/' + source.name })),
        { name: 'L02549.xml', uri: 'https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-briefe/editions/L02549.xml', xml: await Bun.file(new URL('L02549.xml', letterDirectory)).text() },
    ], pairedProfile.mapping);
    for (const basePath of ['/', '/pair/']) {
        const files = await generateSite(paired.edition, paired.manifest, { ...options, basePath, sourceLinks: undefined });
        checkLinks(files, basePath);
        const letter = [...files.values()].find(html => html.includes('<h1>Olga Schnitzler'))!;
        expect(letter).toContain('aria-label="Note 1"');
        expect(letter).toContain('Source attachment point');
        expect(letter).toContain('Donnerstag, 10. Juni 1909');
        expect(letter).toContain('[9. 6. 1909?]');
        expect(letter).toContain('Die Datierung');
    }
});

test('independent meeting edition retains incomplete-reading notices and valid static routes', async () => {
    const fixtureDirectory = new URL('../../../fixtures/akademieprotokolle/', import.meta.url);
    const mapping = MappingProfileSchema.parse(await Bun.file(new URL('mapping.json', fixtureDirectory)).json()).mapping;
    const sourceInputs = await Promise.all(['C_0001.xml', 'A_0058.xml'].map(async name => ({ name, uri: 'https://id.acdh.oeaw.ac.at/akademieprotokolle/' + name, xml: await Bun.file(new URL(name, fixtureDirectory)).text() })));
    const bundle = compileWithManifest(sourceInputs, mapping, { authorities: [{ name: 'listperson.xml', uri: mapping.authorityDocuments!.person!, xml: await Bun.file(new URL('listperson.xml', fixtureDirectory)).text() }] });
    for (const basePath of ['/', '/akademie/']) {
        const files = await generateSite(bundle.edition, bundle.manifest, { ...options, basePath, sourceLinks: undefined });
        checkLinks(files, basePath);
        expect(files.size).toBe(89);
        expect(files.get('diagnostics.html')).toContain('73 compiler diagnostics');
        const general = [...files.values()].find(html => html.includes('<h1>Gesamtsitzung am'))!;
        expect(general).toContain('Incomplete transcription: 6 source entries remain uncompiled');
        expect(general).toContain('Source marker');
        expect(general).toContain('Seite_NaN');
        expect(general).toContain('unsupported-facsimile-zones');
    }
});

test('source-backed editorial commentary and page-image links work without interpreting selectors', async () => {
    const source = { name: 'comment.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="comment"><teiHeader><fileDesc><titleStmt><title>Commented document</title><editor xml:id="ed">Editor One</editor></titleStmt></fileDesc><encodingDesc><interp xml:id="c"><desc>Editorial comment</desc><respons resp="#ed"/><certainty cert="high"/></interp></encodingDesc></teiHeader><facsimile><graphic url="https://source.example/image.jpg"/></facsimile><text><body><p><pb facs="https://source.example/image.jpg" n="1"/><rs ana="#c">source phrase</rs></p></body></text></TEI>' };
    const bundle = compileWithManifest([source], { partKinds: {}, entityKinds: {}, elementPartKinds: { body: 'text' } });
    const before = JSON.stringify(bundle);
    const files = await generateSite(bundle.edition, bundle.manifest, { title: 'Pilot', attribution: 'Test', basePath: '/', previews: { [bundle.edition.resources[0].id]: 'https://images.example/current.jpg' }, about: { title: 'About', paragraphs: ['<script>literal text</script>'] } });
    expect(files.has('workspace.js')).toBe(true);
    const workspacePage = [...files].find(([name, html]) => name.endsWith('.html') && html.includes('data-image-workspace'))?.[1]!;
    expect(workspacePage).toContain('data-image-workspace hidden');
    expect(workspacePage).toContain('Read beside transcription');
    expect(workspacePage).toContain('No alignment is inferred');
    checkLinks(files, '/');
    const page = [...files].find(([name]) => name.startsWith('document-'))![1];
    expect(page).toContain('source-comment-ref');
    expect(page).toContain('Editorial comment');
    expect(page).toContain('Responsibility:');
    expect(page).toContain('Editor One');
    expect(page).toContain('Certainty: high');
    expect(page).toContain('Referenced passages:');
    expect(page).toContain('View image');
    expect(page).toContain('Back to page marker 1');
    expect(page).toContain('href="https://images.example/current.jpg"');
    expect(page).toContain('https://source.example/image.jpg');
    expect(files.get('about.html')).toContain('&lt;script&gt;literal text&lt;/script&gt;');
    expect(JSON.stringify(bundle)).toBe(before);
});


test('compound document contents follow semantic nesting and reading order', async () => {
    const source = { name: 'amp-transcript__0040.xml', xml: await Bun.file(new URL('../../../fixtures/auden-musulin/amp-transcript__0040.xml', import.meta.url)).text() };
    const compiled = compileWithManifest([source]);
    const before = JSON.stringify(compiled.edition);
    const files = await generateSite(compiled.edition, compiled.manifest, { ...options, sourceLinks: undefined });
    checkLinks(files, options.basePath);
    const html = [...files].find(([name]) => name.startsWith('document-'))![1];
    expect(html).toContain('aria-label="Document parts"');
    expect(html).toContain('<h2>Transcript</h2>');
    expect(html).toContain('<h3>Envelope</h3>');
    expect(html).toContain('<h3>Letter</h3>');
    expect(html).toMatch(/<h[4-6]>Poem<\/h[4-6]>/);
    expect(html.indexOf('>Envelope</a>')).toBeLessThan(html.indexOf('>Letter</a>'));
    expect(JSON.stringify(compiled.edition)).toBe(before);
});

test('source marker inspection preserves each position, evidence and entity link without nested anchors', async () => {
    const xml = '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body><p><persName ref="https://example.test/person">A<space quantity="3" unit="char"/>B</persName><gap reason="lost" extent="unknown"/><g ref="#missing"/><app><lem>Unselected</lem></app></p></body></text></TEI>';
    const compiled = compileWithManifest([{ name: 'markers.xml', xml }], { partKinds: {}, elementPartKinds: { body: 'text' }, entityKinds: { persName: 'person' } });
    const before = JSON.stringify(compiled.edition);
    for (const basePath of ['/', '/edition/']) {
        const files = await generateSite(compiled.edition, compiled.manifest, { ...options, sourceLinks: undefined, basePath });
        checkLinks(files, basePath);
        const html = [...files].find(([name]) => name.startsWith('document-'))![1];
        expect((html.match(/class="source-marker"/g) ?? []).length).toBe(4);
        expect((html.match(/>Back to source marker<\/a>/g) ?? []).length).toBe(4);
        for (const kind of ['spacing', 'missing text', 'glyph', 'uncompiled content']) expect(html).toContain('Inspect ' + kind + ' marker');
        expect(html).toContain('<dt>extent</dt><dd>unknown</dd>');
        expect(html).not.toMatch(/<a\b[^>]*>(?:(?!<\/a>)[\s\S])*<a\b/);
    }
    expect(JSON.stringify(compiled.edition)).toBe(before);
});

test('rich notes retain local semantic styles, declared languages and missing-text evidence', async () => {
    const compiled = compileWithManifest([{ name: 'note.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body><p>Main<note xml:lang="en">A<del>B</del><hi>C</hi><hi rend="super">2</hi><am>.</am><foreign xml:lang="de">Wort</foreign><gap reason="lost"/>&lt;script&gt;</note>End</p></body></text></TEI>' }], { partKinds: {}, elementPartKinds: { body: 'text' }, entityKinds: {} });
    const before = JSON.stringify(compiled.edition);
    const files = await generateSite(compiled.edition, compiled.manifest, { ...options, sourceLinks: undefined });
    checkLinks(files, options.basePath);
    const html = [...files].find(([name]) => name.startsWith('document-'))![1];
    expect(html).toContain('class="deletion" lang="en" title="deletion">B</span>');
    expect(html).toContain('class="emphasis" lang="en" title="emphasis">C</span>');
    expect(html).toContain('class="superscript"');
    expect(html).toContain('class="abbreviation-marker"');
    expect(html).toContain('lang="de" title="language">Wort</span>');
    expect(html).toContain('aria-label="Inspect missing text in note"');
    expect(html).toContain('extentReason: lost');
    expect(html).toContain('&lt;script&gt;');
    expect(JSON.stringify(compiled.edition)).toBe(before);
});
