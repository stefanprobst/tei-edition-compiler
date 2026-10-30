import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { compileWithManifest, createSourceIndex, MappingProfileSchema, verifyCompilationSources } from '../src';
const directory = new URL('../../../fixtures/legalkraus/', import.meta.url);
const manifest = await Bun.file(new URL('manifest.json', directory)).json();
const name = 'D_000196-084-000.xml';
const source = { name, uri: manifest.files[name].uri, xml: await Bun.file(new URL(name, directory)).text() };
const mapping = MappingProfileSchema.parse(await Bun.file(new URL('mapping.json', directory)).json()).mapping;
const bundle = compileWithManifest([source], mapping);

test('pinned Legal Kraus bytes and every emitted provenance selector verify', async () => {
    const bytes = await Bun.file(new URL(name, directory)).bytes();
    expect(bytes.length).toBe(manifest.files[name].bytes);
    expect(createHash('sha256').update(bytes).digest('hex')).toBe(manifest.files[name].sha256);
    expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(manifest.files[name].gitBlob);
    expect(verifyCompilationSources(bundle.edition, bundle.manifest, [source]).verifiedSources).toBe(1);
});

test('text sections preserve the two page cohorts without claiming witness alignment', () => {
    const e = bundle.edition, parts = e.documents[0].parts;
    expect(parts.map(p => p.kind)).toEqual(['transcript', 'text-section']);
    expect(parts[1].parentId).toBe(parts[0].id);
    expect(parts.map(p => e.anchors.filter(a => a.partId === p.id).length)).toEqual([56, 43]);
    expect(e.resources).toHaveLength(99);
    expect(e.annotations.filter(a => a.details.feature === 'witness-resource-binding')).toHaveLength(2);
    expect(e.annotations.filter(a => a.details.feature === 'hand-attribution')).toHaveLength(4);
    expect(e.annotations.filter(a => a.details.feature === 'hand-attribution').every(a => a.details.rawScribeReference === '#pmb38909')).toBe(true);
    expect(e.relations.some(r => r.predicate === 'scribe' || r.predicate === 'witness')).toBe(false);
});

test('restorations and transpositions remain bounded source-backed uncertainty', () => {
    const e = bundle.edition, index = createSourceIndex(source);
    const restorations = e.annotations.filter(a => a.details.feature === 'restoration');
    expect(restorations).toHaveLength(13);
    for (const marker of restorations) {
        expect(index.resolve(marker.provenance)!.localName).toBe('restore');
        expect(marker.body).toBeUndefined();
        expect(e.documents[0].parts.find(p => p.id === marker.range!.partId)!.content!.text.slice(marker.range!.start, marker.range!.end)).toBe('\uFFFC');
        expect(e.annotations.find(a => a.id === marker.parentId)?.kind).toBe('deletion');
    }
    const declaration = e.annotations.find(a => a.kind === 'uncompiled-assertion' && a.details.feature === 'transposition')!;
    expect(declaration.details.rawTargets).toBe('#D_000001-001-000_seg002 #D_000001-001-000_seg001');
    expect(index.resolve({ source: name, selector: 'id("D_000001-001-000_seg001")' })).toBeUndefined();
    expect(index.resolve({ source: name, selector: 'id("D_000196-084-000_seg001")' })!.localName).toBe('seg');
    expect(e.annotations.filter(a => a.kind === 'uncompiled-content' && a.details.feature === 'transposition')).toHaveLength(4);
    expect(e.annotations.filter(a => a.kind === 'note')).toHaveLength(109);
});

test('independent restoration suppression is atomic and does not invent a reading', () => {
    const e = compileWithManifest([{ name: 'independent.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body>A<del>B<restore>C<note>private note</note><add>D</add></restore>E</del>F</body></text></TEI>' }], { partKinds: {}, entityKinds: {}, elementPartKinds: { body: 'text' } }).edition;
    expect(e.documents[0].parts[0].content!.text).toBe('AB\uFFFCEF');
    expect(e.annotations.some(a => a.kind === 'insertion' || a.kind === 'note')).toBe(false);
    expect(e.diagnostics.map(d => d.code)).toEqual(['unsupported-restoration']);
});

test('explicit generic division fallback does not override typed project rules', () => {
    const source = { name: 'parts.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body><div type="letter">A</div><div>B</div></body></text></TEI>' };
    const mapping = { partKinds: { letter: 'letter' }, entityKinds: {}, elementPartKinds: { body: 'transcript', div: 'text-section' } };
    expect(compileWithManifest([source], mapping).edition.documents[0].parts.map(part => part.kind)).toEqual(['transcript', 'letter', 'text-section']);
    expect(compileWithManifest([source], { ...mapping, elementPartKinds: { body: 'transcript' } }).edition.documents[0].parts.map(part => part.kind)).toEqual(['transcript', 'letter']);
});
