import { expect, test } from 'bun:test';
import { EditionSchema, documentEvents } from '@acdh-oeaw/tei-edition-ir';
import { compile, createSourceIndex, audenMusulinMapping } from '../src';

const directory = new URL('../../../fixtures/auden-musulin/', import.meta.url);
const sources = await Promise.all(['0001', '0040', '0078', '0028', '0062'].map(async n => {
    const name = `amp-transcript__${n}.xml`;
    return { name, xml: await Bun.file(new URL(name, directory)).text() };
}));
const edition = compile(sources);
const sample = (body: string) => compile([{ name: 'order.xml', xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="order"><teiHeader><fileDesc><titleStmt><title>Order</title></titleStmt></fileDesc></teiHeader><text><body><div type="transcription">${body}</div></body></text></TEI>` }]);

test('anchors and empty nested parts at one offset retain their interleaving', () => {
    const result = sample('<pb ed="before"/><div type="photo"><pb ed="inside"/></div><pb ed="after"/><div type="poem"/><pb ed="last"/>');
    const parts = new Map(result.documents[0].parts.map(p => [p.id, p]));
    const anchors = new Map(result.anchors.map(a => [a.id, a]));
    const events = [...documentEvents(result, 'order')].map(e => e.kind === 'anchor' ? `anchor:${anchors.get(e.anchorId)!.label}` : `${e.kind}:${parts.get(e.partId)!.kind}`);
    expect(events).toEqual([
        'enter-part:transcript', 'anchor:before', 'enter-part:photograph', 'anchor:inside',
        'exit-part:photograph', 'anchor:after', 'enter-part:poem', 'exit-part:poem',
        'anchor:last', 'exit-part:transcript',
    ]);
    expect(result.anchors.every(a => a.offset === 0)).toBe(true);
});

test('the iterator interleaves parent text and nested content without duplication', () => {
    const result = sample('A<div type="letter">B</div>C<div type="poem">D</div>E');
    const events = [...documentEvents(result, 'order')];
    expect(events.filter(e => e.kind === 'text').map(e => e.text)).toEqual(['A', 'B', 'C', 'D', 'E']);
    expect(events.filter(e => e.kind === 'text').map(e => [e.start, e.end])).toEqual([[0, 1], [0, 1], [1, 2], [0, 1], [2, 3]]);
});

test('intentional whitespace and line breaks remain addressable around nested parts', () => {
    const result = sample(' <div type="letter"> </div><pb ed="after"/><lb/>');
    expect(result.documents[0].parts[0].content?.text).toBe(' \n');
    expect(result.documents[0].parts[1].content?.text).toBe(' ');
    expect([...documentEvents(result, 'order')].filter(e => e.kind === 'text').map(e => e.text)).toEqual([' ', ' ', '\n']);
    expect(result.anchors[0].offset).toBe(1);
});

test('all fixture structural events match independent TEI source traversal', () => {
    for (const source of sources) {
        const index = createSourceIndex(source);
        const document = edition.documents.find(d => d.provenance.source === source.name)!;
        const expected = [index.root, ...Array.from(index.root.getElementsByTagName('*'))].filter(e =>
            e.namespaceURI === 'http://www.tei-c.org/ns/1.0' &&
            (e.localName === 'pb' || (e.localName === 'div' && Object.hasOwn(audenMusulinMapping.partKinds, e.getAttribute('type') || '')) || Object.hasOwn(audenMusulinMapping.elementPartKinds!, e.localName))
        ).map(e => ({ kind: e.localName === 'pb' ? 'anchor' as const : 'enter-part' as const, selector: index.selector(e) }));
        const records = new Map([...document.parts, ...edition.anchors].map(r => [r.id, r]));
        const actual = [...documentEvents(edition, document.id)].filter(e => e.kind === 'enter-part' || e.kind === 'anchor').map(e => ({ kind: e.kind, selector: records.get(e.kind === 'anchor' ? e.anchorId : e.partId)!.provenance.selector }));
        expect(actual).toEqual(expected);
    }
});

test('each part text and anchor occurs exactly once; part boundaries stay balanced', () => {
    for (const document of edition.documents) {
        const stack: string[] = [], text = new Map<string, string>(), seenAnchors = new Set<string>();
        let enters = 0;
        for (const event of documentEvents(edition, document.id)) {
            if (event.kind === 'enter-part') { stack.push(event.partId); enters++; }
            else if (event.kind === 'exit-part') expect(stack.pop()).toBe(event.partId);
            else if (event.kind === 'text') {
                expect(stack.at(-1)).toBe(event.partId);
                expect(event.end - event.start).toBe(event.text.length);
                text.set(event.partId, (text.get(event.partId) ?? '') + event.text);
            } else if (event.kind === 'anchor') {
                expect(stack.at(-1)).toBe(event.partId);
                expect(seenAnchors.has(event.anchorId)).toBe(false);
                seenAnchors.add(event.anchorId);
            }
        }
        expect(stack).toEqual([]);
        expect(enters).toBe(document.parts.length);
        for (const part of document.parts) expect(text.get(part.id) ?? '').toBe(part.content?.text ?? '');
        const ids = new Set(document.parts.map(p => p.id));
        expect(seenAnchors.size).toBe(edition.anchors.filter(a => ids.has(a.partId)).length);
    }
});

test('serialized IR remains consumable after storage arrays are reordered and provenance is opaque', () => {
    const copy = JSON.parse(JSON.stringify(edition));
    copy.documents.forEach((d: { parts: unknown[] }) => d.parts.reverse());
    copy.anchors.reverse();
    for (const record of [...copy.documents, ...copy.documents.flatMap((d: { parts: unknown[] }) => d.parts), ...copy.anchors]) record.provenance.selector = 'opaque-to-consumer';
    const validated = EditionSchema.parse(copy);
    for (const d of edition.documents) expect([...documentEvents(validated, d.id)]).toEqual([...documentEvents(edition, d.id)]);
});

test('version 0.1 payloads are rejected rather than guessing ambiguous order', () => {
    const copy = JSON.parse(JSON.stringify(edition));
    copy.version = '0.1';
    expect(EditionSchema.safeParse(copy).success).toBe(false);
    copy.version = '0.2';
    delete copy.documents[0].parts[0].order;
    expect(EditionSchema.safeParse(copy).success).toBe(false);
});

test('ordering validation rejects duplicate orders, reopened subtrees and reversed text positions', () => {
    const base = sample('A<div type="letter">B</div>C<pb ed="after"/>D');
    const duplicate = structuredClone(base);
    duplicate.anchors[0].order = duplicate.documents[0].parts[1].order;
    expect(EditionSchema.safeParse(duplicate).success).toBe(false);
    const reopened = sample('<div type="letter"><pb ed="inside"/></div><pb ed="after"/>');
    [reopened.anchors[0].order, reopened.anchors[1].order] = [reopened.anchors[1].order, reopened.anchors[0].order];
    expect(EditionSchema.safeParse(reopened).success).toBe(false);
    const backwards = structuredClone(base);
    backwards.anchors[0].offset = 0;
    expect(EditionSchema.safeParse(backwards).success).toBe(false);
    const beforeParent = structuredClone(base);
    beforeParent.documents[0].parts[1].order = 0;
    beforeParent.documents[0].parts[0].order = 1;
    expect(EditionSchema.safeParse(beforeParent).success).toBe(false);
});

test('unknown document IDs fail clearly', () => {
    expect(() => [...documentEvents(edition, 'missing')]).toThrow('Unknown document');
});
