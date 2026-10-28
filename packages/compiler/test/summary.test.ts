import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { EditionSchema, summarizeEdition } from '@acdh-oeaw/tei-edition-ir';
import { compile, MappingProfileSchema } from '../src';

const sources = await Promise.all(['0001', '0040', '0078', '0028', '0062'].map(async n => {
    const name = 'amp-transcript__' + n + '.xml';
    return { name, xml: await Bun.file('fixtures/auden-musulin/' + name).text() };
}));
const edition = compile(sources);

test('the artifact summary exposes heterogeneous document structure and unresolved evidence', () => {
    const report = summarizeEdition(edition);
    expect(report.irVersion).toBe('0.4');
    expect(report.totals.documents).toBe(5);
    expect(report.totals.parts).toBe(35);
    expect(report.totals.anchors).toBe(145);
    expect(report.entities.withLabels).toBe(3);
    expect(report.relations.byPredicate['responsible-for']).toBe(45);
    expect(report.relations.byPredicate.references).toBe(23);
    expect(report.annotations.externalAnnotationTargets).toBe(9);
    expect(report.diagnostics).toEqual({ total: 9, byCode: { 'unresolved-interpretation': 9 } });
    const photo = report.documents.find(d => d.id === 'amp-transcript__0078.xml')!;
    expect(photo.parts).toEqual({ total: 2, byKind: { photograph: 1, transcript: 1 }, withText: 0, textLength: 0 });
    expect(photo.resources).toBe(1); expect(photo.anchors).toBe(1);
    expect(photo.sourceDiagnostics.total).toBe(0);
});

test('reporting is deterministic and does not mutate or depend on part storage order', () => {
    const before = JSON.stringify(edition), expected = summarizeEdition(edition);
    const copy = structuredClone(edition);
    for (const d of copy.documents) d.parts.reverse();
    copy.entities.reverse(); copy.mentions.reverse(); copy.anchors.reverse();
    copy.relations.reverse(); copy.annotations.reverse(); copy.diagnostics.reverse();
    expect(summarizeEdition(copy)).toEqual(expected);
    expect(JSON.stringify(edition)).toBe(before);
});

test('synthetic authority labels and unowned authority diagnostics remain accurately scoped', async () => {
    const profile = MappingProfileSchema.parse(await Bun.file('fixtures/synthetic/generic-mapping.json').json());
    const input = { name: 'generic.xml', xml: await Bun.file('fixtures/synthetic/generic-edition.xml').text() };
    const authority = { name: 'register.xml', uri: 'https://example.test/authorities.xml', xml: await Bun.file('fixtures/synthetic/authorities.xml').text() };
    const generic = compile([input], profile.mapping, { authorities: [authority] });
    const report = summarizeEdition(generic);
    expect(report.totals.documents).toBe(1);
    expect(report.entities).toEqual({ withLabels: 2, byKind: { person: 1, place: 1 } });
    expect(report.documents[0].parts.byKind).toEqual({ text: 1, verse: 1 });
    generic.diagnostics.push({ code: 'authority-review', message: 'Review register', provenance: { source: 'register.xml', selector: 'opaque' } });
    const review = summarizeEdition(generic);
    expect(review.diagnostics.total).toBe(1);
    expect(review.documents[0].sourceDiagnostics.total).toBe(0);
});

test('an empty validated edition has explicit zero counts', () => {
    const empty = EditionSchema.parse({ version: '0.4', id: 'empty', documents: [], entities: [], mentions: [], relations: [], annotations: [], resources: [], anchors: [], diagnostics: [] });
    const report = summarizeEdition(empty);
    expect(report.totals.documents).toBe(0); expect(report.totals.textLength).toBe(0);
    expect(report.documents).toEqual([]); expect(report.entities.byKind).toEqual({});
    expect(report.diagnostics).toEqual({ total: 0, byCode: {} });
});

test('the inspection CLI reads serialized IR with unavailable sources and opaque selectors', async () => {
    const directory = await mkdtemp('/tmp/tei-inspection-');
    try {
        const copy = JSON.parse(JSON.stringify(edition));
        const records = [...copy.documents, ...copy.documents.flatMap((d: { parts: unknown[] }) => d.parts), ...copy.entities, ...copy.mentions, ...copy.relations, ...copy.annotations, ...copy.resources, ...copy.anchors, ...copy.diagnostics];
        for (const record of records) {
            record.provenance.source = 'unavailable/' + record.provenance.source;
            record.provenance.selector = 'opaque';
        }
        const input = directory + '/edition.json', output = directory + '/report.json', error = directory + '/stderr.txt';
        await Bun.write(input, JSON.stringify(copy));
        const child = Bun.spawn(['bun', 'packages/ir/src/inspect-cli.ts', input], { stdout: Bun.file(output), stderr: Bun.file(error) });
        expect(await child.exited).toBe(0);
        expect(await Bun.file(error).text()).toBe('');
        const report = await Bun.file(output).json();
        expect(report.totals.parts).toBe(35);
        expect(report.totals.anchors).toBe(145);
        expect(report.diagnostics.total).toBe(9);
        expect(report.documents.every((d: { source: string }) => d.source.startsWith('unavailable/'))).toBe(true);
    } finally { await rm(directory, { recursive: true }); }
});

test('inspection rejects invalid versioned artifacts before emitting a report', async () => {
    const directory = await mkdtemp('/tmp/tei-inspection-invalid-');
    try {
        const input = directory + '/edition.json', output = directory + '/report.json', error = directory + '/stderr.txt';
        await Bun.write(input, JSON.stringify({ ...edition, version: '0.1' }));
        const child = Bun.spawn(['bun', 'packages/ir/src/inspect-cli.ts', input], { stdout: Bun.file(output), stderr: Bun.file(error) });
        expect(await child.exited).not.toBe(0);
        expect(await Bun.file(output).text()).toBe('');
        expect(await Bun.file(error).text()).toContain('0.4');
    } finally { await rm(directory, { recursive: true }); }
});

test('opaque IDs are never treated as inherited JavaScript object entries', () => {
    const provenance = { source: 'source.xml', selector: 'opaque' };
    const edition = EditionSchema.parse({
        version: '0.4', id: 'opaque', documents: [{
            id: 'document', provenance, metadata: { title: 'Opaque IDs', dates: [], languages: [], identifiers: [], rights: [] },
            parts: [{ id: 'constructor', kind: 'text', order: 0, content: { kind: 'text', text: 'X' }, resourceIds: [], provenance }],
            resourceIds: [], relationIds: [], annotationIds: [],
        }], entities: [], mentions: [], relations: [], annotations: [], resources: [], anchors: [], diagnostics: [],
    });
    const report = summarizeEdition(edition);
    expect(report.documents[0].mentions).toBe(0);
    expect(report.documents[0].anchors).toBe(0);
    expect(report.totals.textLength).toBe(1);
});
