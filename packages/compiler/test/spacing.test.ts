import { expect, test } from 'bun:test';
import { projectDocumentText, projectSourceRange, sourceRangesForText } from '@tei-edition/ir';
import { compile } from '../src';
const sample = (body: string) => compile([{ name: 'spacing.xml', xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="spacing"><teiHeader><fileDesc><titleStmt><title>Spacing</title></titleStmt></fileDesc></teiHeader><text><body><div type="transcription">${body}</div></body></text></TEI>` }]);

test('explicit spacing occupies a source-backed position and expansion is opt-in', () => {
    const edition = sample('A<space quantity="3" unit="char"/>B');
    const annotation = edition.annotations[0];
    expect(edition.documents[0].parts[0].content?.text).toBe('A\uFFFCB');
    expect(annotation.range).toMatchObject({ start: 1, end: 2 });
    expect(annotation.details).toMatchObject({ quantity: '3', unit: 'char', characterCount: '3' });
    expect(projectDocumentText(edition, 'spacing', { deletionText: 'retain' }).text).toBe('A\uFFFCB');
    const before = JSON.stringify(edition);
    expect(projectDocumentText(edition, 'spacing', { deletionText: 'retain', spacing: 'characters' }).text).toBe('A   B');
    expect(JSON.stringify(edition)).toBe(before);
});

test('expanded characters map to the spacing occurrence rather than fabricated source characters', () => {
    const edition = sample('A<space quantity="3" unit="char"/><pb/>B');
    const projection = projectDocumentText(edition, 'spacing', { deletionText: 'retain', spacing: 'characters' });
    const source = edition.annotations.find(a => a.kind === 'spacing')!.range!;
    expect(projection.text).toBe('A   B');
    expect(projectSourceRange(projection, source)).toEqual([{ start: 1, end: 4 }]);
    expect(sourceRangesForText(projection, { start: 2, end: 3 })).toEqual([source]);
    expect(projection.runs.find(r => r.spacingAnnotationId)?.source).toEqual(source);
    expect(projection.anchors[0]).toMatchObject({ sourceOffset: 2, offset: 4 });
});

test('spacing inside retained insertions expands while deleted spacing stays omitted', () => {
    const edition = sample('A<subst><del>x<space quantity="2" unit="char"/></del><add><space quantity="1" unit="char"/></add></subst>B');
    expect(projectDocumentText(edition, 'spacing', { deletionText: 'omit', spacing: 'characters' }).text).toBe('A B');
    expect(projectDocumentText(edition, 'spacing', { deletionText: 'retain', spacing: 'characters' }).text).toBe('Ax   B');
});

test('unknown extents, minimums and physical units retain markers with projection issues', () => {
    const edition = sample('A<space extent="unknown" min="3" unit="char"/>B<space quantity="3" unit="mm"/>C');
    const projection = projectDocumentText(edition, 'spacing', { deletionText: 'retain', spacing: 'characters' });
    expect(projection.text).toBe('A\uFFFCB\uFFFCC');
    expect(projection.issues.map(i => i.code)).toEqual(['unmeasured-spacing', 'unmeasured-spacing']);
    expect(edition.diagnostics).toEqual([]);
});

test('invalid character counts preserve original evidence and receive compiler diagnostics', () => {
    for (const quantity of ['-1', '1.5', 'many', '9007199254740992']) {
        const edition = sample(`A<space quantity="${quantity}" unit="char"/>B`);
        expect(edition.annotations[0].details.quantity).toBe(quantity);
        expect(edition.annotations[0].details.characterCount).toBeUndefined();
        expect(edition.diagnostics[0].code).toBe('invalid-spacing-quantity');
        expect(projectDocumentText(edition, 'spacing', { deletionText: 'retain', spacing: 'characters' }).text).toBe('A\uFFFCB');
    }
});

test('zero character counts and explicit expansion limits preserve valid mappings', () => {
    const zero = sample('A<space quantity="0" unit="char"/>B');
    const empty = projectDocumentText(zero, 'spacing', { deletionText: 'retain', spacing: 'characters' });
    expect(empty.text).toBe('AB');
    expect(projectSourceRange(empty, zero.annotations[0].range!)).toEqual([]);
    const edition = sample('A<space quantity="3" unit="char"/>B');
    const limited = projectDocumentText(edition, 'spacing', { deletionText: 'retain', spacing: 'characters', maxSpacingCharacters: 2 });
    expect(limited.text).toBe('A\uFFFCB');
    expect(limited.issues[0].code).toBe('spacing-expansion-limit');
    expect(() => projectDocumentText(edition, 'spacing', { deletionText: 'retain', maxSpacingCharacters: -1 })).toThrow('Invalid');
});

test('legacy zero-width and duplicate spacing annotations do not cause invented ordering', () => {
    const edition = sample('AB');
    const part = edition.documents[0].parts[0];
    edition.annotations.push({ id: 'legacy', kind: 'spacing', targetIds: [part.id], range: { partId: part.id, start: 1, end: 1 }, responsibility: [], evidence: [], details: { characterCount: '3' }, provenance: part.provenance });
    const projection = projectDocumentText(edition, 'spacing', { deletionText: 'retain', spacing: 'characters' });
    expect(projection.text).toBe('AB');
    expect(projection.issues[0].code).toBe('spacing-without-marker');
    const duplicate = sample('A<space quantity="3" unit="char"/>B');
    duplicate.annotations.push({ ...duplicate.annotations[0], id: 'duplicate' });
    const ambiguous = projectDocumentText(duplicate, 'spacing', { deletionText: 'retain', spacing: 'characters' });
    expect(ambiguous.text).toBe('A\uFFFCB');
    expect(ambiguous.issues[0].code).toBe('ambiguous-spacing');
});

test('gap markers are not interpreted as spacing', () => {
    const edition = sample('A<gap quantity="3" unit="char"/>B');
    const projection = projectDocumentText(edition, 'spacing', { deletionText: 'retain', spacing: 'characters' });
    expect(projection.text).toBe('A\uFFFCB');
    expect(projection.issues).toEqual([]);
});

test('real measured and unmeasured spacing stays distinguishable in corpus projections', async () => {
    const sources = await Promise.all(['0040', '0028', '0062'].map(async n => {
        const name = `amp-transcript__${n}.xml`;
        return { name, xml: await Bun.file(new URL(`../../../fixtures/auden-musulin/${name}`, import.meta.url)).text() };
    }));
    const edition = compile(sources);
    for (const document of edition.documents) {
        const projection = projectDocumentText(edition, document.id, { deletionText: 'retain', spacing: 'characters' });
        expect(projection.anchors.length).toBe(edition.anchors.filter(a => document.parts.some(p => p.id === a.partId)).length);
        expect(projection.runs.some(r => !!r.spacingAnnotationId)).toBe(document.id !== 'amp-transcript__0040.xml');
        if (document.id === 'amp-transcript__0040.xml') expect(projection.issues.filter(i => i.code === 'unmeasured-spacing')).toHaveLength(96);
        for (const run of projection.runs.filter(r => !!r.spacingAnnotationId)) {
            const annotation = edition.annotations.find(a => a.id === run.spacingAnnotationId)!;
            expect(projection.text.slice(run.start, run.end)).toBe(' '.repeat(Number(annotation.details.characterCount)));
            expect(sourceRangesForText(projection, { start: run.start, end: run.end })).toEqual([run.source]);
        }
    }
    expect(edition.diagnostics.some(d => d.code === 'invalid-spacing-quantity')).toBe(false);
});
