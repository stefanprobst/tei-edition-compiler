import { expect, test } from 'bun:test';
import { compile, createSourceIndex, type Source } from '../src';

function source(id: string, editors: string, interpretations: string): Source {
    return { name: `${id}.xml`, uri: `https://edition.example/${id}.xml`, xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="${id}"><teiHeader><fileDesc><titleStmt><title>Contributors</title>${editors}</titleStmt><editionStmt><interpGrp>${interpretations}</interpGrp></editionStmt></fileDesc></teiHeader></TEI>` };
}
const editor = (id: string, name: string, uri = `https://people.example/${id}`) => `<editor><name xml:id="${id}" ref="${uri}">${name}</name></editor>`;
const assertion = (refs: string, id = 'assertion') => `<interp xml:id="${id}"><desc>Scholarly assertion</desc><respons resp="${refs}" locus="value"/><certainty cert="high"/></interp>`;

test('responsibility becomes explicit person-to-annotation relations with source evidence', () => {
    const input = source('a', editor('ed', 'Ada Example'), assertion('ed'));
    const edition = compile([input]);
    const person = edition.entities[0], annotation = edition.annotations[0];
    expect(person.kind).toBe('person');
    expect(person.authorityRef).toBe('https://people.example/ed');
    expect(person.label).toBe('Ada Example');
    expect(person.provenance.selector).toBe('id("ed")');
    expect(annotation.responsibility).toEqual(['ed']);
    expect(annotation.certainty).toBe('high');
    expect(edition.relations[0]).toMatchObject({ predicate: 'responsible-for', subjectId: person.id, objectIds: [annotation.id] });
    const index = createSourceIndex(input);
    expect(index.resolve(edition.relations[0].provenance)?.localName).toBe('respons');
    expect(edition.documents[0].relationIds).toEqual([edition.relations[0].id]);
    expect(edition.mentions).toEqual([]);
});

test('local identifiers stay document-scoped while shared canonical identities deduplicate', () => {
    const a = source('a', editor('ed', 'Ada'), assertion('ed b.xml#ed'));
    const b = source('b', editor('ed', 'Bea', 'https://people.example/bea'), assertion('ed'));
    const edition = compile([a, b]);
    expect(edition.entities).toHaveLength(2);
    expect(edition.relations.filter(r => r.objectIds.includes(edition.annotations[0].id))).toHaveLength(2);
    expect(edition.relations).toHaveLength(3);
    const shared = compile([a, source('b', editor('ed', 'Ada'), assertion('ed'))]);
    expect(shared.entities).toHaveLength(1);
    expect(shared.relations).toHaveLength(2);
});

test('direct attributes, nested responsibilities and equivalent pointers are retained without duplicate relations', () => {
    const input = source('a', editor('ed', 'Ada') + editor('other', 'Bea'), '<interp xml:id="assertion" resp="#ed"><desc>Claim</desc><respons resp="ed https://people.example/ed other"/></interp>');
    const edition = compile([input]);
    expect(edition.annotations[0].responsibility).toEqual(['#ed', 'ed', 'https://people.example/ed', 'other']);
    expect(edition.relations).toHaveLength(2);
    expect(edition.entities).toHaveLength(2);
});

test('missing, mistyped and non-contributor IDs are diagnosed without fuzzy matching', () => {
    const input = source('a', editor('ed', 'Ada'), assertion('de #assertion https://missing.example/person'));
    const edition = compile([input]);
    expect(edition.entities).toEqual([]);
    expect(edition.relations).toEqual([]);
    expect(edition.annotations[0].responsibility).toEqual(['de', '#assertion', 'https://missing.example/person']);
    expect(edition.diagnostics.map(d => d.code)).toEqual(['unresolved-responsibility', 'unresolved-responsibility', 'unresolved-responsibility']);
});

test('conflicting contributor labels stay unset while evidence remains explicit', () => {
    const edition = compile([source('a', editor('ed', 'Ada'), assertion('ed')), source('b', editor('ed', 'Bea'), '')]);
    expect(edition.entities).toHaveLength(1);
    expect(edition.entities[0].label).toBeUndefined();
    expect(edition.diagnostics[0].code).toBe('contributor-label-conflict');
    expect(edition.relations).toHaveLength(1);
});

test('contributor definitions without external IDs use stable source-local identities', () => {
    const edition = compile([source('a', '<editor xml:id="ed"><persName>Ada Example</persName></editor>', assertion('ed'))]);
    expect(edition.entities[0].authorityRef).toBe('https://edition.example/a.xml#ed');
    expect(edition.entities[0].label).toBe('Ada Example');
    expect(edition.diagnostics).toEqual([]);
});

test('explicitly supplied authority person records can resolve external responsibility pointers', () => {
    const edition = compile([source('a', '', assertion('https://authority.example/people.xml#ed'))], undefined, { authorities: [{ name: 'people.xml', uri: 'https://authority.example/people.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><listPerson><person xml:id="ed"><persName>Ada Example</persName></person></listPerson></body></text></TEI>' }] });
    expect(edition.entities[0].label).toBe('Ada Example');
    expect(edition.entities[0].provenance.source).toBe('people.xml');
    expect(edition.relations[0].predicate).toBe('responsible-for');
    expect(edition.diagnostics).toEqual([]);
});

test('real fixture responsibility records resolve to three ORCID-backed contributors', async () => {
    const sources = await Promise.all(['0001', '0028', '0062'].map(async n => {
        const name = `amp-transcript__${n}.xml`;
        return { name, xml: await Bun.file(new URL(`../../../fixtures/auden-musulin/${name}`, import.meta.url)).text() };
    }));
    const edition = compile(sources);
    const relations = edition.relations.filter(r => r.predicate === 'responsible-for');
    expect(relations).toHaveLength(45);
    const ids = new Set(relations.map(r => r.subjectId));
    expect(edition.entities.filter(e => ids.has(e.id)).map(e => e.label).sort()).toEqual(['Frühwirth, Timo', 'Grigoriou, Dimitra', 'Mayer, Sandra']);
    expect(edition.entities.filter(e => ids.has(e.id)).every(e => e.authorityRef.startsWith('https://orcid.org/'))).toBe(true);
    expect(edition.diagnostics.some(d => d.code.includes('responsibility') || d.code.includes('contributor'))).toBe(false);
});
