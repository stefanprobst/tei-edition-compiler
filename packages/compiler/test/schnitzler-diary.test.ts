import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { compile, compileWithManifest, createSourceIndex, MappingProfileSchema, verifyCompilationSources } from '../src';
const directory = new URL('../../../fixtures/schnitzler-diary/', import.meta.url);
const manifest = await Bun.file(new URL('manifest.json', directory)).json();
const profile = MappingProfileSchema.parse(await Bun.file(new URL('mapping.json', directory)).json());
const sources = await Promise.all(Object.keys(manifest.files).filter(name => name.endsWith('.xml')).map(async name => ({ name, xml: await Bun.file(new URL(name, directory)).text() })));
const bundle = compileWithManifest(sources, profile.mapping);

test('pinned diary inputs retain upstream bytes, hashes, and provenance selectors', async () => {
    for (const [name, info] of Object.entries(manifest.files) as [string, { sha256: string; gitBlob: string }][]) {
        const bytes = await Bun.file(new URL(name, directory)).bytes();
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(info.sha256);
        expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(info.gitBlob);
    }
    expect(verifyCompilationSources(bundle.edition, bundle.manifest, sources).verifiedSources).toBe(3);
});

test('body dates map explicitly without mistaking publication dates for entry dates', () => {
    expect(bundle.edition.documents.map(d => d.metadata.dates)).toEqual(['09', '10', '11'].map(day => [{ kind: 'exact', value: `1909-06-${day}`, label: `${Number(day)}/6` }]));
    expect(compile(sources, { ...profile.mapping, documentDatePaths: undefined }).documents.every(d => d.metadata.dates.length === 0)).toBe(true);
    expect(MappingProfileSchema.safeParse({ version: '1', mapping: { ...profile.mapping, documentDatePaths: ['//date'] } }).success).toBe(false);
});

test('direct facsimile graphics are resources without guessed text alignment', () => {
    expect(bundle.edition.resources).toHaveLength(5);
    expect(bundle.edition.resources.every(r => r.uri.startsWith('https://id.acdh.oeaw.ac.at/schnitzler/faksimiles/tagebuch/'))).toBe(true);
    expect(bundle.edition.anchors).toHaveLength(1);
    expect(bundle.edition.anchors[0]).toMatchObject({ label: '73', resourceIds: [] });
    expect(bundle.edition.documents.map(d => d.resourceIds.length)).toEqual([2, 2, 1]);
});

test('explicit space preservation keeps source paragraph text, and repeated occurrences share identity', () => {
    const edition = bundle.edition;
    expect(edition.entities).toHaveLength(24);
    expect(edition.mentions).toHaveLength(31);
    expect(edition.entities.every(e => e.label === undefined)).toBe(true);
    expect(edition.mentions.filter(m => m.entityIds.includes(edition.entities.find(e => e.authorityRef.endsWith('#pmb10863'))!.id))).toHaveLength(3);
    for (const source of sources) {
        const index = createSourceIndex(source);
        const document = edition.documents.find(d => d.provenance.source === source.name)!;
        const part = document.parts[0];
        const paragraphs = Array.from(index.root.getElementsByTagNameNS('http://www.tei-c.org/ns/1.0', 'p')).filter(p => p.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'space') === 'preserve');
        for (const paragraph of paragraphs) expect(part.content!.text).toContain(paragraph.textContent!);
        for (const mention of edition.mentions.filter(m => m.range.partId === part.id)) expect(part.content!.text.slice(mention.range.start, mention.range.end).replace(/\s+/g, ' ').trim()).toBe(mention.label);
    }
    expect(edition.diagnostics).toEqual([]);
    const components = edition.annotations.filter(a => a.kind === 'name-component');
    expect(components).toHaveLength(37);
    expect(Object.fromEntries(['given-name', 'family-name', 'role-name'].map(kind => [kind, components.filter(a => a.details.component === kind).length]))).toEqual({ 'given-name': 15, 'family-name': 19, 'role-name': 3 });
    for (const component of components) {
        const part = edition.documents.flatMap(d => d.parts).find(p => p.id === component.range!.partId)!;
        const index = createSourceIndex(sources.find(s => s.name === component.provenance.source)!);
        expect(part.content!.text.slice(component.range!.start, component.range!.end)).toBe(index.resolve(component.provenance)!.textContent!);
    }
});

test('xml:space inheritance and default reset retain bounded offsets', () => {
    const result = compile([{ name: 'space.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body><div type="entry" xml:space="preserve">A  <hi>B\n C</hi><hi xml:space="default">D  E</hi> F</div></body></text></TEI>' }], { partKinds: { entry: 'entry' }, entityKinds: {} });
    expect(result.documents[0].parts[0].content!.text).toBe('A  B\n CD E F');
    expect(result.annotations[0].range).toMatchObject({ start: 3, end: 7 });
});


test('source sequence resolves supplied neighbors while keeping cohort boundaries external', () => {
    const relations = bundle.edition.relations.filter(r => ['previous-document', 'next-document'].includes(r.predicate));
    expect(relations).toHaveLength(6);
    expect(relations.flatMap(r => r.objectIds)).toHaveLength(4);
    expect(relations.flatMap(r => r.externalTargets ?? []).map(t => t.sourceId)).toEqual([
        'https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-tagebuch/editions/entry__1909-06-08.xml',
        'https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-tagebuch/editions/entry__1909-06-12.xml',
    ]);
});

test('name components preserve semantic roles and nested markup without inventing an entity', () => {
    const result = compile([{ name: 'name.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body><div type="entry"><persName><roleName>Dr.</roleName> <forename>A<hi>n</hi>a</forename> <surname>Example</surname></persName></div></body></text></TEI>' }], { partKinds: { entry: 'entry' }, entityKinds: {} });
    expect(result.diagnostics).toEqual([]);
    expect(result.entities).toEqual([]);
    expect(result.annotations.filter(a => a.kind === 'name-component').map(a => [a.details.component, a.body])).toEqual([['role-name', 'Dr.'], ['given-name', 'Ana'], ['family-name', 'Example']]);
    const emphasis = result.annotations.find(a => a.kind === 'emphasis')!;
    expect(emphasis.parentId).toBe(result.annotations.find(a => a.details.component === 'given-name')!.id);
});
