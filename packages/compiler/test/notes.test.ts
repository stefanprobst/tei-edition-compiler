import { expect, test } from 'bun:test';
import { compileWithManifest, createSourceIndex, MappingProfileSchema, verifyCompilationSources } from '../src';
import { fingerprintJson } from '../src/fingerprints';
import { projectDocumentText } from '@acdh-oeaw/tei-edition-ir';

const fixture = (body: string) => ({ name: 'notes.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>Notes</title><editor xml:id="ed">Editor</editor></titleStmt></fileDesc></teiHeader><text><body>' + body + '</body></text></TEI>' });
const mapping = { partKinds: {}, elementPartKinds: { body: 'text' }, entityKinds: {} };

test('plain notes remain separate source-backed annotations, not running text', () => {
    const source = fixture('A<note resp="#ed" cert="low" source="https://example.test/source" type="commentary" place="foot"> A comment. </note>B<pb n="2"/>C<note/>');
    const bundle = compileWithManifest([source], mapping);
    const document = bundle.edition.documents[0];
    expect(document.parts[0].content!.text).toBe('ABC');
    const notes = bundle.edition.annotations.filter(annotation => annotation.kind === 'note');
    expect(notes).toHaveLength(2);
    expect(notes[0].content!.text).toBe(' A comment. ');
    expect(notes[0].range).toEqual({ partId: document.parts[0].id, start: 1, end: 1 });
    expect(notes[0].details).toMatchObject({ contentStatus: 'compiled', classification: 'commentary', placement: 'foot' });
    expect(notes[0].certainty).toBe('low');
    expect(notes[0].responsibility).toEqual(['#ed']);
    expect(notes[0].evidence).toContain('https://example.test/source');
    expect(notes[1].content!.text).toBe('');
    expect(bundle.edition.anchors[0].offset).toBe(2);
    expect(bundle.edition.relations.some(relation => relation.predicate === 'responsible-for' && relation.objectIds.includes(notes[0].id))).toBe(true);
    expect(bundle.edition.diagnostics).toEqual([]);
    expect(verifyCompilationSources(bundle.edition, bundle.manifest, [source]).verifiedSources).toBe(1);
});

test('rich note bodies and unsupported attachment semantics are quarantined without false readings', () => {
    const source = fixture('A<note><unknown>important</unknown></note>B<note target="#elsewhere">remote comment</note>C<note><app><lem>one</lem><rdg>two</rdg></app></note>D');
    const { edition } = compileWithManifest([source], mapping);
    expect(edition.documents[0].parts[0].content!.text).toBe('ABCD');
    const notes = edition.annotations.filter(annotation => annotation.kind === 'note');
    expect(notes).toHaveLength(3);
    expect(notes.every(note => note.content === undefined && note.body === undefined && note.details.contentStatus === 'uncompiled')).toBe(true);
    expect(edition.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['unsupported-note-content', 'unsupported-note-content', 'unsupported-note-content']);
    expect(edition.annotations.some(annotation => annotation.kind === 'uncompiled-content')).toBe(false);
});

test('note anchors remain within parent interventions under explicit filtering', () => {
    const source = fixture('A<del>B<note>Deletion commentary</note>C</del>D');
    const { edition } = compileWithManifest([source], mapping);
    const note = edition.annotations.find(annotation => annotation.kind === 'note')!;
    const parent = edition.annotations.find(annotation => annotation.id === note.parentId)!;
    expect(parent.kind).toBe('deletion');
    expect(parent.body).toBe('BC');
    expect(note.range!.start).toBe(2);
    expect(projectDocumentText(edition, edition.documents[0].id, { deletionText: 'omit' }).text).toBe('AD');
    expect(note.content!.text).toBe('Deletion commentary');
});

test('both real DHARMA sources separate all notes outside apparatus without changing apparatus counts', async () => {
    const manifest = await Bun.file('fixtures/dharma/manifest.json').json();
    const names = Object.keys(manifest.files).filter(name => name.endsWith('.xml'));
    const sources = await Promise.all(names.map(async name => ({ name, xml: await Bun.file('fixtures/dharma/' + name).text() })));
    const profile = MappingProfileSchema.parse(await Bun.file('fixtures/dharma/mapping.json').json());
    const bundle = compileWithManifest(sources, profile.mapping);
    const notes = bundle.edition.annotations.filter(annotation => annotation.kind === 'note');
    expect(notes).toHaveLength(168);
    expect(notes.filter(note => note.details.contentStatus === 'compiled')).toHaveLength(168);
    expect(notes.filter(note => note.details.contentStatus === 'uncompiled')).toHaveLength(0);
    const rich = notes.filter(note => note.content!.annotations.length > 0);
    expect(rich).toHaveLength(4);
    expect(rich.every(note => note.content!.annotations.every(annotation => annotation.kind === 'emphasis' && annotation.details.presentation === 'check'))).toBe(true);
    expect(bundle.edition.annotations.filter(annotation => annotation.kind === 'uncompiled-content')).toHaveLength(37);
    const indexes = new Map(sources.map(source => [source.name, createSourceIndex(source, { expectedSha256: manifest.files[source.name] })]));
    for (const note of notes) {
        expect(note.range!.start).toBe(note.range!.end);
        expect(indexes.get(note.provenance.source)!.resolve(note.provenance)?.localName).toBe('note');
    }
    expect(bundle.edition.documents[0].parts.map(part => part.content?.text ?? '').join('')).not.toContain('Corr. tr̥ṇadrumā');
    expect(verifyCompilationSources(bundle.edition, bundle.manifest, sources).verifiedSources).toBe(2);
}, 15_000);

test('notes and candidates share one validated content model, including rich-note provenance', async () => {
    const { AnnotatedTextSchema, editionProvenanceRecords } = await import('@acdh-oeaw/tei-edition-ir');
    const source = fixture('A<note>See <hi rend="check">this <foreign xml:lang="de">word</foreign></hi>.</note>B');
    const bundle = compileWithManifest([source], mapping);
    const note = bundle.edition.annotations.find(annotation => annotation.kind === 'note')!;
    expect(note.body).toBeUndefined();
    expect(AnnotatedTextSchema.parse(note.content).text).toBe('See this word.');
    expect(note.content!.annotations.map(annotation => annotation.kind)).toEqual(['emphasis', 'language']);
    const language = note.content!.annotations[1];
    expect(language.parentId).toBe(note.content!.annotations[0].id);
    expect(note.content!.text.slice(language.range.start, language.range.end)).toBe('word');
    const records = editionProvenanceRecords(bundle.edition);
    expect(records.some(record => 'id' in record && record.id === language.id)).toBe(true);
    expect(verifyCompilationSources(bundle.edition, bundle.manifest, [source]).verifiedProvenanceRecords).toBe(records.length);
    expect(bundle.edition.diagnostics).toEqual([]);
    const edited = structuredClone(bundle);
    edited.edition.annotations.find(annotation => annotation.kind === 'note')!.content!.annotations[0].provenance.selector = 'id("missing")';
    edited.manifest.editionSha256 = fingerprintJson(edited.edition);
    expect(() => verifyCompilationSources(edited.edition, edited.manifest, [source])).toThrow('Unresolved provenance');
});

test('IR v0.3 rejects stale versions, duplicate content IDs, foreign owners and dual text bodies', async () => {
    const { EditionSchema } = await import('@acdh-oeaw/tei-edition-ir');
    const { edition } = compileWithManifest([fixture('A<note><hi>x</hi></note>B<note><hi>y</hi></note>')], mapping);
    expect(edition.version).toBe('0.3');
    expect(EditionSchema.safeParse({ ...edition, version: '0.2' }).success).toBe(false);
    const dual = structuredClone(edition); dual.annotations.find(annotation => annotation.kind === 'note')!.body = 'Duplicate';
    expect(EditionSchema.safeParse(dual).success).toBe(false);
    const local = edition.annotations.filter(annotation => annotation.kind === 'note');
    const duplicate = structuredClone(edition); const copies = duplicate.annotations.filter(annotation => annotation.kind === 'note');
    copies[1].content!.annotations[0].id = copies[0].content!.annotations[0].id;
    expect(EditionSchema.safeParse(duplicate).success).toBe(false);
    const foreign = structuredClone(edition); foreign.annotations.find(annotation => annotation.kind === 'note')!.content!.annotations[0].provenance.source = 'other.xml';
    expect(EditionSchema.safeParse(foreign).success).toBe(false);
    const broken = structuredClone(edition); broken.annotations.find(annotation => annotation.kind === 'note')!.content!.annotations[0].range.end = 999;
    expect(EditionSchema.safeParse(broken).success).toBe(false);
    const missing = structuredClone(edition); delete missing.annotations.find(annotation => annotation.kind === 'note')!.content;
    expect(EditionSchema.safeParse(missing).success).toBe(false);
    expect(local).toHaveLength(2);
});
