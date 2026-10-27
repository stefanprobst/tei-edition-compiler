import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { compileWithManifest, MappingProfileSchema, verifyCompilationSources, type Source } from '../src';
const directory = new URL('../../../fixtures/', import.meta.url);
const profile = MappingProfileSchema.parse(await Bun.file(new URL('schnitzler-letters/mapping.json', directory)).json());
const sources: Source[] = [];
for (const [cohort, base] of [['schnitzler-diary', 'https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-tagebuch/editions/'], ['schnitzler-letters', 'https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-briefe/editions/']]) {
    const fixture = await Bun.file(new URL(cohort + '/manifest.json', directory)).json();
    for (const name of Object.keys(fixture.files).filter(name => name.endsWith('.xml'))) sources.push({ name, uri: base + name, xml: await Bun.file(new URL(cohort + '/' + name, directory)).text() });
}
const bundle = compileWithManifest(sources, profile.mapping);
const edition = bundle.edition;
const letter = edition.documents.find(d => d.id === 'L02549')!;
const notes = edition.annotations.filter(a => a.kind === 'note');

test('letter fixture and license retain original upstream bytes and source selectors verify', async () => {
    const fixture = await Bun.file(new URL('schnitzler-letters/manifest.json', directory)).json();
    for (const [name, info] of Object.entries(fixture.files) as [string, { sha256: string; gitBlob: string }][]) {
        const bytes = await Bun.file(new URL('schnitzler-letters/' + name, directory)).bytes();
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(info.sha256);
        expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(info.gitBlob);
    }
    expect(verifyCompilationSources(edition, bundle.manifest, sources)).toEqual({ verifiedSources: 4, verifiedProvenanceRecords: 168 });
    expect(edition.diagnostics).toEqual([]);
});

test('commentary remains separate from running text with explicit point attachments', () => {
    const text = letter.parts.map(p => p.content?.text ?? '').join('');
    expect(text).not.toContain('Die Datierung');
    expect(text).not.toContain('umso besser');
    expect(notes).toHaveLength(2);
    for (const note of notes) {
        expect(note.details.contentStatus).toBe('compiled');
        const attachment = edition.relations.find(r => r.subjectId === note.id && r.predicate === 'annotates')!;
        const point = edition.annotations.find(a => a.id === attachment.objectIds[0])!;
        expect(point.kind).toBe('reference-point');
        expect(point.range!.start).toBeLessThan(note.range!.start);
        expect(point.range!.end).toBe(point.range!.start);
        expect(note.range!.end).toBe(note.range!.start);
    }
    expect(notes[1].content!.annotations).toMatchObject([{ kind: 'language', language: 'fr' }]);
    expect(edition.annotations.find(a => a.kind === 'time-expression')!.body).toBe('½ 8 Uhr Abend');
});

test('the declared date shorthand resolves across editions and remains external without supplied diary', () => {
    const relation = edition.relations.find(r => r.predicate === 'references' && r.subjectId === notes[0].id)!;
    expect(relation.objectIds).toEqual(['entry__1909-06-10.xml']);
    expect(relation.provenance.source).toBe('L02549.xml');
    const standalone = compileWithManifest(sources.filter(s => s.name === 'L02549.xml'), profile.mapping).edition;
    expect(standalone.relations.find(r => r.predicate === 'references')!.externalTargets).toEqual([{ kind: 'document', sourceId: 'https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-tagebuch/editions/entry__1909-06-10.xml' }]);
    expect(letter.metadata.dates.every(date => date.label.includes('?'))).toBe(true);
    expect(letter.resourceIds).toHaveLength(3);
    expect(edition.anchors.filter(a => letter.parts.some(p => p.id === a.partId)).every(a => a.resourceIds.length === 1)).toBe(true);
});
