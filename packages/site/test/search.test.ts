import { expect, test } from 'bun:test';
import { compileWithManifest } from '../../compiler/src';
import { generateSite } from '../src';
import { parseSearchIndex, searchText } from '../src/search';
const bundle = compileWithManifest([{ name: 'search.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="search"><teiHeader><fileDesc><titleStmt><title>Search sample</title></titleStmt></fileDesc></teiHeader><text><body><div type="text">😀 Hello <del>OLD</del> [a.*] <div type="verse">nested words</div> tail</div></body></text></TEI>' }], { partKinds: { text: 'text', verse: 'verse' }, entityKinds: {} });
const options = { title: 'Search sample', attribution: 'Project-authored fixture', basePath: '/edition/', search: true, documentRoutes: { search: 'original-source.html' } };
const files = await generateSite(bundle.edition, bundle.manifest, options);
const index = parseSearchIndex(JSON.parse(files.get('search-index.json')!), bundle.manifest.editionSha256, options.basePath);

test('literal Unicode search retains UTF-16 ranges and explicit diplomatic policy across nested parts', () => {
    expect(index.policy).toEqual({ deletionText: 'retain', spacing: 'source' });
    expect(searchText(index, 'hello')[0]).toMatchObject({ start: 3, end: 8, match: 'Hello' });
    expect(searchText(index, 'old')[0].match).toBe('OLD');
    expect(searchText(index, '[a.*]')[0].match).toBe('[a.*]');
    const result = searchText(index, 'words tail')[0];
    expect(result.sourceRanges).toHaveLength(2);
    const reconstructed = result.sourceRanges.map(range => bundle.edition.documents[0].parts.find(p => p.id === range.partId)!.content!.text.slice(range.start, range.end)).join('');
    expect(reconstructed).toBe(result.match);
    expect(searchText(index, 'x')).toEqual([]);
    expect(searchText(index, 'x'.repeat(257))).toEqual([]);
    expect(searchText(index, 'hello', 0)).toEqual([]);
});

test('search routes and data binding are validated and search output is a static artifact', () => {
    expect(files.has('search.js')).toBe(true);
    expect(files.get('search.html')).toContain('type="module"');
    expect(index.documents[0].route).toBe('/edition/original-source.html');
    expect(searchText(index, 'hello')[0].href).toMatch(/^\/edition\/original-source\.html#record-[a-f0-9]{64}$/);
    expect(() => parseSearchIndex(index, '0'.repeat(64), options.basePath)).toThrow();
    const broken = structuredClone(index); broken.documents[0].runs[0].source.end++;
    expect(() => parseSearchIndex(broken, bundle.manifest.editionSha256, options.basePath)).toThrow();
    const external = structuredClone(index); external.documents[0].route = 'javascript:alert(1)';
    expect(() => parseSearchIndex(external, bundle.manifest.editionSha256, options.basePath)).toThrow();
});

test('publication route collisions and unknown preview identities fail before files are written', async () => {
    for (const route of ['../source.html', 'index.html', 'entities.html', 'search.html']) await expect(generateSite(bundle.edition, bundle.manifest, { ...options, documentRoutes: { search: route } })).rejects.toThrow();
    await expect(generateSite(bundle.edition, bundle.manifest, { ...options, documentRoutes: { missing: 'missing.html' } })).rejects.toThrow();
    await expect(generateSite(bundle.edition, bundle.manifest, { ...options, previews: { missing: 'https://example.test/image.jpg' } })).rejects.toThrow();
});

test('the browser search artifact has a page-bound digest so changed routes cannot reuse a stale index', async () => {
    const { createHash } = await import('node:crypto');
    const sha = createHash('sha256').update(files.get('search-index.json')!).digest('hex');
    expect(files.get('search.html')).toContain(`name="search-index-sha256" content="${sha}"`);
    const changed = await generateSite(bundle.edition, bundle.manifest, { ...options, documentRoutes: { search: 'different-route.html' } });
    expect(changed.get('search-index.json')).not.toBe(files.get('search-index.json'));
    expect(changed.get('search.html')).not.toContain(`content="${sha}"`);
});
