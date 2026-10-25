import { expect, test } from 'bun:test';
import { compile, type Source } from '../src';

const mapping = { partKinds: { prose: 'prose' }, entityKinds: {}, referencePrefixes: { edition: 'https://example.org/edition/' } };
function source(id: string, body: string, interpretations = '<interp xml:id="shared"><desc>Explanation</desc></interp>'): Source {
    return {
        name: `fixtures/${id}`,
        uri: `https://example.org/edition/${id}`,
        xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="${id}"><teiHeader><fileDesc><titleStmt><title>${id}</title></titleStmt><editionStmt>${interpretations}</editionStmt></fileDesc></teiHeader><text><body><div type="prose"><p>${body}</p></div></body></text></TEI>`,
    };
}

test('interpretation resolution is independent of source order and document-scoped', () => {
    const a = source('a.xml', '<seg ana="#shared edition:b.xml#shared">Passage</seg>');
    const b = source('b.xml', '<seg ana="#shared">Another passage</seg>');
    const result = compile([a, b], mapping);
    const reverse = compile([b, a], mapping);
    const links = (edition: ReturnType<typeof compile>) => edition.annotations.filter(a => a.kind === 'interpretation-link').sort((a, b) => a.id.localeCompare(b.id));
    expect(links(result)).toEqual(links(reverse));
    expect(result.diagnostics).toEqual([]);
    const link = links(result).find(l => l.provenance.source === a.name)!;
    expect(link.targetIds).toHaveLength(2);
    const targets = link.targetIds.map(id => result.annotations.find(a => a.id === id)!);
    expect(new Set(targets.map(t => t.provenance.source))).toEqual(new Set([a.name, b.name]));
    expect(result.annotations.filter(a => a.kind === 'interpretation-link')).toHaveLength(2);
});

test('multiple and repeated pointers create one link with unique resolved targets', () => {
    const result = compile([source('a.xml', '<seg ana="#shared #shared #other">Passage</seg>', '<interp xml:id="shared">First</interp><interp xml:id="other">Second</interp>')], mapping);
    const link = result.annotations.find(a => a.kind === 'interpretation-link')!;
    expect(link.targetIds).toHaveLength(2);
    expect(link.evidence).toEqual(['#shared', '#other']);
    expect(result.annotations.filter(a => a.kind === 'interpretation-link')).toHaveLength(1);
});

test('missing sources and missing fragments remain explicit external targets', () => {
    const a = source('a.xml', '<seg ana="b.xml#missing absent.xml#shared">Passage</seg>');
    const result = compile([a, source('b.xml', '')], mapping);
    const link = result.annotations.find(a => a.kind === 'interpretation-link')!;
    expect(link.targetIds).toEqual([]);
    expect(link.externalTargets).toEqual([
        { kind: 'annotation', source: 'https://example.org/edition/b.xml', selector: 'id("missing")' },
        { kind: 'annotation', source: 'https://example.org/edition/absent.xml', selector: 'id("shared")' },
    ]);
    expect(result.diagnostics.map(d => d.message)).toEqual(['b.xml#missing', 'absent.xml#shared']);
    expect(link.range).toBeDefined();
    expect(link.provenance.source).toBe(a.name);
});

test('matching basenames and fragments in another authority do not resolve', () => {
    const result = compile([source('a.xml', '<seg ana="https://other.org/edition/b.xml#shared">Passage</seg>'), source('b.xml', '')], mapping);
    const link = result.annotations.find(a => a.kind === 'interpretation-link')!;
    expect(link.targetIds).toEqual([]);
    expect(link.externalTargets?.[0].source).toBe('https://other.org/edition/b.xml');
    expect(result.diagnostics).toHaveLength(1);
});

test('file paths resolve relative references without project URI configuration', () => {
    const a = source('a.xml', '<seg ana="b.xml#shared">Passage</seg>');
    const b = source('b.xml', '');
    delete a.uri; delete b.uri;
    const result = compile([a, b], { partKinds: { prose: 'prose' }, entityKinds: {} });
    const link = result.annotations.find(a => a.kind === 'interpretation-link')!;
    expect(link.targetIds).toEqual([result.annotations.find(a => a.kind === 'interpretation' && a.provenance.source === b.name)!.id]);
    expect(result.diagnostics).toEqual([]);
});

test('encoded fragments resolve and repeated links deduplicate inverse targets', () => {
    const result = compile([source('a.xml', '<seg ana="#sh%61red">First</seg> <seg ana="#shared">Second</seg>')], mapping);
    const interpretation = result.annotations.find(a => a.kind === 'interpretation')!;
    expect(interpretation.targetIds).toHaveLength(2); // Owning document and referring part.
    expect(result.annotations.filter(a => a.kind === 'interpretation-link')).toHaveLength(2);
    expect(result.diagnostics).toEqual([]);
});

test('malformed pointers retain their evidence and diagnostics', () => {
    const result = compile([source('a.xml', '<seg ana="#%ZZ no-fragment">Passage</seg>')], mapping);
    const link = result.annotations.find(a => a.kind === 'interpretation-link')!;
    expect(link.evidence).toEqual(['#%ZZ', 'no-fragment']);
    expect(link.targetIds).toEqual([]);
    expect(result.diagnostics).toHaveLength(2);
});

test('ambiguous source URIs fail instead of silently redirecting references', () => {
    const a = source('a.xml', '');
    const b = source('b.xml', '');
    b.uri = a.uri;
    expect(() => compile([a, b], mapping)).toThrow('Ambiguous source URI');
});

test('source document URIs cannot contain fragment identifiers', () => {
    const a = source('a.xml', '');
    a.uri += '#shared';
    expect(() => compile([a], mapping)).toThrow('must not contain a fragment');
});

test('source names with URI-reserved filename characters retain literal file identity', () => {
    const a = source('a.xml', '<seg ana="other%23draft.xml#shared">Passage</seg>');
    const b = source('b.xml', '');
    delete a.uri; delete b.uri;
    a.name = 'fixtures/a?100%.xml'; b.name = 'fixtures/other#draft.xml';
    const result = compile([a, b], { partKinds: { prose: 'prose' }, entityKinds: {} });
    const link = result.annotations.find(a => a.kind === 'interpretation-link')!;
    expect(link.targetIds).toEqual([result.annotations.find(a => a.kind === 'interpretation' && a.provenance.source === b.name)!.id]);
    expect(result.diagnostics).toEqual([]);
});

test('explicit document identities reject empty fragment markers too', () => {
    const a = source('a.xml', '');
    a.uri += '#';
    expect(() => compile([a], mapping)).toThrow('must not contain a fragment');
    a.uri = '';
    expect(() => compile([a], mapping)).toThrow();
});
