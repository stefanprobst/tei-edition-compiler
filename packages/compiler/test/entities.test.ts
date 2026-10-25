import { expect, test } from 'bun:test';
import { compile, audenMusulinMapping, type Mapping, type Source } from '../src';
import { annotationReference, entityReference } from '../src/references';

const mapping: Mapping = { partKinds: { prose: 'prose' }, entityKinds: { person: 'person', place: 'place', unknown: 'unknown' } };
function source(id: string, body: string, profile = ''): Source {
    return {
        name: `${id}.xml`, uri: `https://edition.example/${id}.xml`,
        xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="${id}"><teiHeader><fileDesc><titleStmt><title>Sample</title></titleStmt></fileDesc><profileDesc>${profile}</profileDesc></teiHeader><text><body><div type="prose"><p>${body}</p></div></body></text></TEI>`,
    };
}

test('full authority identity prevents fragment collisions', () => {
    const result = compile([source('a', '<rs type="person" ref="https://one.example/people.xml#p1">First</rs> <rs type="person" ref="https://two.example/people.xml#p1">Second</rs>')], mapping);
    expect(result.entities).toHaveLength(2);
    expect(result.mentions[0].entityIds).not.toEqual(result.mentions[1].entityIds);
    expect(result.entities.map(e => e.authorityRef)).toEqual(['https://one.example/people.xml#p1', 'https://two.example/people.xml#p1']);
});

test('unconfigured local fragments remain local to each source document', () => {
    const result = compile([source('a', '<rs type="person" ref="#p1">First</rs>'), source('b', '<rs type="person" ref="#p1">Second</rs>')], mapping);
    expect(result.entities).toHaveLength(2);
    expect(result.entities.map(e => e.authorityRef)).toEqual(['https://edition.example/a.xml#p1', 'https://edition.example/b.xml#p1']);
});

test('configured authority scopes join fragment, explicit URI and bare participant references', () => {
    const shared: Mapping = { ...mapping, authorityDocuments: { person: 'https://authority.example/people.xml' } };
    const result = compile([
        source('a', '<rs type="person" ref="#p1">I</rs>'),
        source('b', '<rs type="person" ref="https://authority.example/people.xml#p1">Ada</rs>', '<particDesc><listPerson><person role="participant" sameAs="p1"><note>photographer</note></person></listPerson></particDesc>'),
    ], shared);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].authorityRef).toBe('https://authority.example/people.xml#p1');
    expect(result.entities[0].label).toBeUndefined();
    expect(result.mentions.map(m => m.label)).toEqual(['I', 'Ada']);
    expect(result.relations[0].objectIds).toEqual([result.entities[0].id]);
    expect(result.relations[0].description).toBe('photographer');
});

test('kind-specific authority scopes do not merge similarly named records', () => {
    const scoped: Mapping = { ...mapping, authorityDocuments: { person: 'https://authority.example/people', place: 'https://authority.example/places' } };
    const result = compile([source('a', '<rs type="person" ref="#same">Person</rs> <rs type="place" ref="#same">Place</rs>')], scoped);
    expect(result.entities).toHaveLength(2);
    expect(result.diagnostics).toEqual([]);
});

test('compact prefixes and encoded fragments produce canonical authority identities', () => {
    const scoped: Mapping = { ...mapping, referencePrefixes: { auth: 'https://authority.example/' } };
    const result = compile([source('a', '<rs type="person" ref="auth:people.xml#p%31 https://authority.example/people.xml#p1">Same person</rs>')], scoped);
    expect(result.entities).toHaveLength(1);
    expect(result.mentions[0].entityIds).toHaveLength(1);
    expect(result.entities[0].authorityRef).toBe('https://authority.example/people.xml#p1');
    expect(entityReference('#percent%2520', 'https://edition.example/a', mapping)).toBe('https://edition.example/a#percent%2520');
    expect(annotationReference('#percent%2520', 'https://edition.example/a', mapping)?.fragment).toBe('percent%20');
});

test('conflicting classifications are diagnosed without choosing the first kind', () => {
    const result = compile([source('a', '<rs type="person" ref="https://authority.example/record">Person</rs> <rs type="place" ref="https://authority.example/record">Place</rs>')], mapping);
    expect(result.entities).toHaveLength(1);
    expect(result.entities[0].kind).toBe('unknown');
    expect(result.diagnostics.map(d => d.code)).toEqual(['entity-kind-conflict']);
    expect(result.diagnostics[0].provenance.selector).toContain('rs[2]');
});

test('unknown classifications do not conflict with known evidence', () => {
    for (const types of [['unknown', 'person'], ['person', 'unknown']]) {
        const result = compile([source('a', types.map(type => `<rs type="${type}" ref="https://authority.example/record">Reference</rs>`).join(' '))], mapping);
        expect(result.entities[0].kind).toBe('person');
        expect(result.diagnostics).toEqual([]);
    }
});

test('invalid entity references retain occurrence evidence and emit diagnostics', () => {
    const result = compile([source('a', '<rs type="person" ref="https://[">Unreadable reference</rs>')], mapping);
    expect(result.entities[0].authorityRef).toBe('https://[');
    expect(result.mentions[0].label).toBe('Unreadable reference');
    expect(result.diagnostics.map(d => d.code)).toEqual(['invalid-entity-reference']);
});

test('Auden preset scopes are explicit and entity IDs do not depend on source order', () => {
    const a = source('a', '<rs type="person" ref="#amp_person_1">I</rs>');
    const b = source('b', '<rs type="person" ref="acdh:amp-index-persons.xml#amp_person_1">Auden</rs>');
    const preset = { ...audenMusulinMapping };
    const forward = compile([a, b], preset), reverse = compile([b, a], preset);
    expect(forward.entities).toHaveLength(1);
    expect(forward.entities[0].id).toBe(reverse.entities[0].id);
    expect(forward.entities[0].authorityRef).toBe('https://id.acdh.oeaw.ac.at/auden-musulin-papers/amp-index-persons.xml#amp_person_1');
    expect(forward.entities[0].label).toBeUndefined();
});

test('empty fragment identifiers do not become authority-document person records', () => {
    const result = compile([source('a', '<rs type="person" ref="#">Unknown</rs>')], mapping);
    expect(result.entities[0].authorityRef).toBe('#');
    expect(result.diagnostics[0].code).toBe('invalid-entity-reference');
});
