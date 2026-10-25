import { expect, test } from 'bun:test';
import { documentEvents, projectDocumentText, projectSourceRange, sourceRangesForText } from '@acdh-oeaw/tei-edition-ir';
import { compile } from '../src';

const sample = (body: string) => compile([{ name: 'projection.xml', xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="projection"><teiHeader><fileDesc><titleStmt><title>Projection</title></titleStmt></fileDesc></teiHeader><text><body><div type="transcription">${body}</div></body></text></TEI>` }]);

test('deletion policy is explicit and the source edition is unchanged', () => {
    const edition = sample('A<subst><del>old</del><add>new</add></subst>Z');
    const original = JSON.stringify(edition);
    expect(projectDocumentText(edition, 'projection', { deletionText: 'retain' }).text).toBe('AoldnewZ');
    expect(projectDocumentText(edition, 'projection', { deletionText: 'omit' }).text).toBe('AnewZ');
    expect(JSON.stringify(edition)).toBe(original);
});

test('nested, adjacent and overlapping deletions are excluded once', () => {
    const edition = sample('A<del>o<del>l</del>d</del><del>!</del>B');
    const part = edition.documents[0].parts[0];
    edition.annotations.push({ id: 'overlap', kind: 'deletion', targetIds: [part.id], range: { partId: part.id, start: 2, end: 5 }, responsibility: [], evidence: [], details: {}, provenance: part.provenance });
    expect(projectDocumentText(edition, 'projection', { deletionText: 'omit' }).text).toBe('AB');
    const nested = sample('A<subst><del><subst><del>old</del><add>intermediate</add></subst></del><add>new</add></subst>Z');
    expect(projectDocumentText(nested, 'projection', { deletionText: 'omit' }).text).toBe('AnewZ');
});

test('anchors inside omitted text survive at the collapsed projected position', () => {
    const edition = sample('A<del>x<pb ed="inside"/>y</del><pb ed="after"/>B');
    const projected = projectDocumentText(edition, 'projection', { deletionText: 'omit' });
    expect(projected.text).toBe('AB');
    expect(projected.anchors.map(a => [a.sourceOffset, a.offset])).toEqual([[2, 1], [3, 1]]);
    expect(projected.anchors.map(a => a.anchorId)).toEqual(edition.anchors.map(a => a.id));
});

test('visible source ranges and projected search ranges map in both directions', () => {
    const edition = sample('A<del>old</del><rs type="person" ref="#person">new</rs>Z');
    const projection = projectDocumentText(edition, 'projection', { deletionText: 'omit' });
    const mention = edition.mentions[0], partId = mention.range.partId;
    expect(projectSourceRange(projection, mention.range)).toEqual([{ start: 1, end: 4 }]);
    expect(projectSourceRange(projection, { partId, start: 1, end: 4 })).toEqual([]);
    expect(sourceRangesForText(projection, { start: 0, end: 4 })).toEqual([{ partId, start: 0, end: 1 }, { partId, start: 4, end: 7 }]);
    expect(sourceRangesForText(projection, { start: 1, end: 4 })).toEqual([mention.range]);
    expect(projectSourceRange(projection, { partId, start: 0, end: 7 })).toEqual([{ start: 0, end: 1 }, { start: 1, end: 4 }]);
});

test('nested parts retain order and range mappings stay part-local', () => {
    const edition = sample('A<div type="letter">B<del>x</del>C</div>D');
    const projection = projectDocumentText(edition, 'projection', { deletionText: 'omit' });
    expect(projection.text).toBe('ABCD');
    const [parent, child] = edition.documents[0].parts;
    expect(projection.parts).toEqual([{ partId: parent.id, start: 0, end: 4 }, { partId: child.id, start: 1, end: 3 }]);
    expect(sourceRangesForText(projection, { start: 0, end: 4 }).map(r => r.partId)).toEqual([parent.id, child.id, child.id, parent.id]);
});

test('part-boundary deletions report scope limits and retain embedded content', () => {
    const edition = sample('A<del>x<div type="letter">Embedded</div>y</del>B');
    const projection = projectDocumentText(edition, 'projection', { deletionText: 'omit' });
    expect(projection.text).toBe('AEmbeddedB');
    expect(projection.issues).toEqual([{ code: 'deletion-crosses-part-boundary', annotationId: edition.annotations.find(a => a.kind === 'deletion')!.id, partId: edition.documents[0].parts[1].id }]);
    expect(projectDocumentText(edition, 'projection', { deletionText: 'retain' }).issues).toEqual([]);
});

test('UTF-16 ranges, empty projections and invalid requests are handled explicitly', () => {
    const edition = sample('A😀<del>x</del>B');
    const projected = projectDocumentText(edition, 'projection', { deletionText: 'omit' });
    expect(projected.text).toBe('A😀B');
    expect(sourceRangesForText(projected, { start: 1, end: 3 })).toEqual([{ partId: edition.documents[0].parts[0].id, start: 1, end: 3 }]);
    const empty = projectDocumentText(sample('<div type="photo"><pb/></div>'), 'projection', { deletionText: 'omit' });
    expect(empty.text).toBe(''); expect(empty.anchors[0].offset).toBe(0);
    expect(sourceRangesForText(empty, { start: 0, end: 0 })).toEqual([]);
    expect(() => sourceRangesForText(projected, { start: -1, end: 2 })).toThrow('Invalid');
    expect(() => sourceRangesForText(projected, { start: 0, end: 100 })).toThrow('exceeds');
    expect(() => projectDocumentText(edition, 'missing', { deletionText: 'omit' })).toThrow('Unknown document');
});

test('all five fixtures project using only serialized IR with faithful source slices', async () => {
    const sources = await Promise.all(['0001', '0040', '0078', '0028', '0062'].map(async n => {
        const name = `amp-transcript__${n}.xml`;
        return { name, xml: await Bun.file(new URL(`../../../fixtures/auden-musulin/${name}`, import.meta.url)).text() };
    }));
    const edition = JSON.parse(JSON.stringify(compile(sources)));
    for (const document of edition.documents) {
        const parts = new Map<string, string>(document.parts.map((p: { id: string; content?: { text: string } }) => [p.id, p.content?.text ?? '']));
        const retained = projectDocumentText(edition, document.id, { deletionText: 'retain' });
        const omitted = projectDocumentText(edition, document.id, { deletionText: 'omit' });
        expect(retained.text).toBe([...documentEvents(edition, document.id)].filter(e => e.kind === 'text').map(e => e.text).join(''));
        expect(omitted.text.length).toBeLessThanOrEqual(retained.text.length);
        expect(omitted.anchors.map(a => a.anchorId)).toEqual(retained.anchors.map(a => a.anchorId));
        for (const projection of [retained, omitted]) {
            let offset = 0;
            for (const run of projection.runs) {
                expect(run.start).toBe(offset);
                expect(projection.text.slice(run.start, run.end)).toBe(parts.get(run.source.partId)!.slice(run.source.start, run.source.end));
                offset = run.end;
            }
            expect(offset).toBe(projection.text.length);
        }
    }
});
