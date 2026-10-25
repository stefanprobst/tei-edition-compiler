import { expect, test } from 'bun:test';
import { compile, createSourceIndex } from '../src';

const directory = new URL('../../../fixtures/auden-musulin/', import.meta.url);
const sources = await Promise.all(['0001', '0040', '0078', '0028', '0062'].map(async n => {
    const name = `amp-transcript__${n}.xml`;
    return { name, xml: await Bun.file(new URL(name, directory)).text() };
}));
const wrap = (body: string) => `<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>Provenance</title></titleStmt></fileDesc></teiHeader><text><body>${body}</body></text></TEI>`;

test('every source element in the five fixtures round-trips through its selector', () => {
    for (const source of sources) {
        const index = createSourceIndex(source);
        const elements = [index.root, ...Array.from(index.root.getElementsByTagName('*'))];
        const selectors = elements.map(e => index.selector(e));
        expect(new Set(selectors).size).toBe(elements.length);
        for (const element of elements) expect(index.resolve(index.selector(element))).toBe(element);
    }
});

test('every emitted provenance record resolves within its declared source', () => {
    const edition = compile(sources);
    const indexes = new Map(sources.map(s => [s.name, createSourceIndex(s)]));
    const records = [
        ...edition.documents, ...edition.documents.flatMap(d => d.parts), ...edition.entities,
        ...edition.mentions, ...edition.relations, ...edition.annotations, ...edition.resources,
        ...edition.anchors, ...edition.diagnostics,
    ];
    for (const { provenance } of records) {
        const index = indexes.get(provenance.source)!;
        expect(index).toBeDefined();
        const element = index.resolve(provenance);
        expect(element).toBeDefined();
        expect(index.selector(element!)).toBe(provenance.selector);
    }
});

test('selectors prefer the nearest ID and remain stable across ancestor sibling insertions', () => {
    const original = createSourceIndex({ name: 'sample.xml', xml: wrap('<div xml:id="stable"><p>Keep</p></div>') });
    const edited = createSourceIndex({ name: 'sample.xml', xml: wrap('<div/><div xml:id="stable"><p>Keep</p></div>') });
    const selector = 'id("stable")/p[1]';
    expect(original.resolve(selector)?.textContent).toBe('Keep');
    expect(edited.resolve(selector)?.textContent).toBe('Keep');
    expect(original.selector(original.resolve(selector)!)).toBe(selector);
    expect(edited.selector(edited.resolve(selector)!)).toBe(selector);
    expect(original.resolve('/TEI[1]/text[1]/body[1]/div[1]')?.getAttribute('xml:id')).toBe('stable');
    expect(edited.resolve('/TEI[1]/text[1]/body[1]/div[1]')?.getAttribute('xml:id')).not.toBe('stable');
});

test('foreign and no-namespace elements cannot collide with TEI element selectors', () => {
    const source = { name: 'namespaces.xml', xml: wrap('<div type="letter" xml:id="part"><p>TEI</p><x:p xmlns:x="urn:foreign">Foreign</x:p><p xmlns="">Unqualified</p></div>') };
    const index = createSourceIndex(source);
    expect(index.resolve('id("part")/p[1]')?.textContent).toBe('TEI');
    expect(index.resolve('id("part")/Q{urn%3Aforeign}p[1]')?.textContent).toBe('Foreign');
    expect(index.resolve('id("part")/Q{}p[1]')?.textContent).toBe('Unqualified');
    const edition = compile([source]);
    expect(edition.diagnostics).toHaveLength(2);
    expect(edition.diagnostics.map(d => index.resolve(d.provenance)?.namespaceURI || '')).toEqual(['urn:foreign', '']);
});

test('namespace prefixes do not change selector identity', () => {
    const xml = wrap('<div xml:id="part"><p>Paragraph</p></div>');
    const prefixed = xml.replace(/<(\/?)([A-Za-z][\w]*)/g, '<$1t:$2').replace('xmlns=', 'xmlns:t=');
    for (const value of [xml, prefixed]) {
        const index = createSourceIndex({ name: 'sample.xml', xml: value });
        expect(index.resolve('id("part")/p[1]')?.textContent).toBe('Paragraph');
        expect(index.selector(index.resolve('id("part")/p[1]')!)).toBe('id("part")/p[1]');
    }
});

test('stale, malformed and unsupported selectors return no element', () => {
    const index = createSourceIndex({ name: 'sample.xml', xml: wrap('<div xml:id="stable"><p>Keep</p></div>') });
    for (const value of ['', '/', 'id("missing")', 'id(stable)', 'id("stable")/', 'id("stable")/p[0]', 'id("stable")/p[-1]', 'id("stable")/p[2]', 'id("stable")/p[1]trailing', 'id("stable")/Q{%ZZ}p[1]', '//p[1]', 'id("stable")/p[9007199254740992]', 'id("stable");globalThis.sideEffect=true']) expect(index.resolve(value)).toBeUndefined();
    expect(index.resolve({ source: 'other.xml', selector: 'id("stable")' })).toBeUndefined();
});

test('duplicate XML IDs are rejected even in metadata that is not mapped into IR', () => {
    const source = { name: 'duplicate.xml', xml: wrap('<div xml:id="same"/><div xml:id="same"/>') };
    expect(() => createSourceIndex(source)).toThrow('Duplicate xml:id');
    expect(() => compile([source])).toThrow('Duplicate xml:id');
});

test('a source index does not accept nodes from another document', () => {
    const first = createSourceIndex({ name: 'first.xml', xml: wrap('') });
    const second = createSourceIndex({ name: 'second.xml', xml: wrap('') });
    expect(() => first.selector(second.root)).toThrow('does not belong');
});
