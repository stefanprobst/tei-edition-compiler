import { expect, test } from 'bun:test';
import { EditionSchema, projectDocumentText, projectSourceRange } from '@acdh-oeaw/tei-edition-ir';
import { compile, createSourceIndex } from '../src';

const source = (body: string) => ({ name: 'containment.xml', xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="containment"><teiHeader><fileDesc><titleStmt><title>Containment</title></titleStmt></fileDesc></teiHeader><text><body><div type="transcription">${body}</div></body></text></TEI>` });

test('lexical annotation containment crosses part boundaries explicitly', () => {
    const input = source('A<del>x<div type="letter">Embedded<pb/>text</div>y</del>B');
    const edition = compile([input]), [parent, child] = edition.documents[0].parts;
    const deletion = edition.annotations.find(a => a.kind === 'deletion')!;
    const relation = edition.relations.find(r => r.predicate === 'contains-part')!;
    expect(relation.subjectId).toBe(deletion.id);
    expect(relation.objectIds).toEqual([child.id]);
    expect(child.parentId).toBe(parent.id);
    expect(createSourceIndex(input).resolve(relation.provenance)?.getAttribute('type')).toBe('letter');
    expect(projectDocumentText(edition, 'containment', { deletionText: 'omit' }).text).toBe('AEmbeddedtextB');
    const projected = projectDocumentText(edition, 'containment', { deletionText: 'omit', nestedDeletedParts: 'omit' });
    expect(projected.text).toBe('AB');
    expect(projected.issues).toEqual([]);
    expect(projected.parts.find(p => p.partId === child.id)).toEqual({ partId: child.id, start: 1, end: 1 });
    expect(projected.anchors[0].offset).toBe(1);
    expect(projectSourceRange(projected, { partId: child.id, start: 0, end: 8 })).toEqual([]);
});

test('an entirely embedded deletion need not occupy parent text', () => {
    const edition = compile([source('A<del><div type="letter">Embedded</div></del>B')]);
    const deletion = edition.annotations.find(a => a.kind === 'deletion')!;
    expect(deletion.range!.start).toBe(deletion.range!.end);
    expect(projectDocumentText(edition, 'containment', { deletionText: 'omit', nestedDeletedParts: 'omit' }).text).toBe('AB');
});

test('ancestor annotation chains and nested part subtrees preserve deletion membership', () => {
    const edition = compile([source('A<del><hi rend="underline"><div type="letter">B<div type="poem">C<pb/></div>D</div></hi></del>E')]);
    edition.documents[0].parts.reverse();
    const parsed = EditionSchema.parse(JSON.parse(JSON.stringify(edition)));
    const before = JSON.stringify(parsed);
    const projection = projectDocumentText(parsed, 'containment', { deletionText: 'omit', nestedDeletedParts: 'omit' });
    expect(projection.text).toBe('AE');
    expect(projection.parts.filter(p => p.start === p.end)).toHaveLength(2);
    expect(projection.anchors[0].offset).toBe(1);
    expect(JSON.stringify(parsed)).toBe(before);
});

test('explicitly separate lexical scopes do not infer deletion from a coincident offset', () => {
    const edition = compile([source('<p>A<del>x</del><div type="letter">Keep</div>B</p>')]);
    const relation = edition.relations.find(r => r.predicate === 'contains-part')!;
    expect(edition.annotations.find(a => a.id === relation.subjectId)?.kind).toBe('paragraph');
    const projection = projectDocumentText(edition, 'containment', { deletionText: 'omit', nestedDeletedParts: 'omit' });
    expect(projection.text).toBe('AKeepB\n');
    expect(projection.issues).toEqual([]);
});

test('legacy absence of containment evidence remains explicit rather than guessed', () => {
    const edition = compile([source('A<del>x<div type="letter">Keep</div>y</del>B')]);
    const removed = new Set(edition.relations.filter(r => r.predicate === 'contains-part').map(r => r.id));
    edition.relations = edition.relations.filter(r => !removed.has(r.id));
    for (const d of edition.documents) d.relationIds = d.relationIds.filter(id => !removed.has(id));
    const projection = projectDocumentText(edition, 'containment', { deletionText: 'omit', nestedDeletedParts: 'omit' });
    expect(projection.text).toBe('AKeepB');
    expect(projection.issues[0].code).toBe('deletion-crosses-part-boundary');
});

test('containment validation rejects wrong target categories, scopes and positions', () => {
    const edition = compile([source('A<del>x<div type="letter">Keep</div>y</del>B')]);
    const wrongSubject = structuredClone(edition);
    wrongSubject.relations.find(r => r.predicate === 'contains-part')!.subjectId = wrongSubject.documents[0].id;
    expect(EditionSchema.safeParse(wrongSubject).success).toBe(false);
    const wrongTarget = structuredClone(edition);
    wrongTarget.relations.find(r => r.predicate === 'contains-part')!.objectIds = [wrongTarget.documents[0].id];
    expect(EditionSchema.safeParse(wrongTarget).success).toBe(false);
    const wrongScope = structuredClone(edition);
    wrongScope.relations.find(r => r.predicate === 'contains-part')!.objectIds = [wrongScope.documents[0].parts[0].id];
    expect(EditionSchema.safeParse(wrongScope).success).toBe(false);
    const wrongPosition = structuredClone(edition);
    wrongPosition.documents[0].parts[1].parentOffset = 0;
    expect(EditionSchema.safeParse(wrongPosition).success).toBe(false);
    expect(() => projectDocumentText(edition, 'containment', { deletionText: 'retain', nestedDeletedParts: 'omit' })).toThrow('requires deletionText omit');
});

test('existing fixture containment does not change text when no embedded part is deleted', async () => {
    const sources = await Promise.all(['0001', '0040', '0078', '0028', '0062'].map(async n => {
        const name = `amp-transcript__${n}.xml`;
        return { name, xml: await Bun.file(new URL(`../../../fixtures/auden-musulin/${name}`, import.meta.url)).text() };
    }));
    const edition = compile(sources);
    expect(edition.relations.filter(r => r.predicate === 'contains-part')).toHaveLength(2);
    for (const d of edition.documents) {
        const retained = projectDocumentText(edition, d.id, { deletionText: 'omit' });
        const omitted = projectDocumentText(edition, d.id, { deletionText: 'omit', nestedDeletedParts: 'omit' });
        expect(omitted.text).toBe(retained.text);
        expect(omitted.anchors).toEqual(retained.anchors);
        expect(omitted.issues).toEqual(retained.issues);
    }
});
