import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { compile, compileWithManifest, createSourceIndex, verifyCompilationSources, type Mapping } from '../src';
const directory = new URL('../../../fixtures/auden-musulin-publication/', import.meta.url);
const manifest = await Bun.file(new URL('manifest.json', directory)).json();
const sources = await Promise.all(Object.keys(manifest.files).map(async name => ({ name, xml: await Bun.file(new URL(name, directory)).text() })));

test('real publication regressions retain original bytes and source-backed column/glyph semantics', async () => {
    for (const source of sources) {
        const bytes = await Bun.file(new URL(source.name, directory)).bytes();
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.files[source.name].sha256);
        expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(manifest.files[source.name].gitBlob);
    }
    const bundle = compileWithManifest(sources);
    const boundaries = bundle.edition.annotations.filter(a => a.kind === 'column-boundary');
    expect(boundaries.map(a => a.details.label)).toEqual(['1', '2']);
    expect(boundaries.every(a => a.range!.start === a.range!.end)).toBe(true);
    const glyphs = bundle.edition.annotations.filter(a => a.kind === 'glyph' && a.evidence.includes('uml_u_lc_th'));
    expect(glyphs).toHaveLength(2);
    expect(glyphs.every(a => a.body === 'ü')).toBe(true);
    expect(bundle.edition.annotations.some(a => a.kind === 'glyph-description' && glyphs.every(g => a.targetIds.includes(g.id)))).toBe(true);
    expect(bundle.edition.diagnostics.every(d => d.code === 'unresolved-interpretation')).toBe(true);
    expect(verifyCompilationSources(bundle.edition, bundle.manifest, sources).verifiedSources).toBe(2);
});

test('glyph aliasing is explicit and preserves original evidence rather than guessing bare identifiers', () => {
    const source = { name: 'glyph.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><encodingDesc><charDecl><glyph xml:id="declared"><desc>Supplied description</desc></glyph></charDecl></encodingDesc></teiHeader><text><body><p><g ref="bare">ä</g></p></body></text></TEI>' };
    const mapping: Mapping = { partKinds: {}, entityKinds: {}, elementPartKinds: { body: 'text' } };
    expect(compile([source], mapping).diagnostics[0].code).toBe('unresolved-glyph');
    const mapped = compile([source], { ...mapping, glyphReferenceAliases: { bare: '#declared' } });
    expect(mapped.diagnostics).toEqual([]);
    expect(mapped.annotations.find(a => a.kind === 'glyph')!.evidence).toEqual(['bare']);
    expect(mapped.documents[0].parts[0].content!.text).toBe('ä\n');
    expect(createSourceIndex(source).resolve(mapped.annotations.find(a => a.kind === 'glyph-description')!.provenance)!.localName).toBe('glyph');
});
