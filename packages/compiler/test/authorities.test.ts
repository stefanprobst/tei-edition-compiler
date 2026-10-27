import { expect, test } from 'bun:test';
import { compile, createSourceIndex, type AuthoritySource, type Mapping } from '../src';
import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';
const authority: AuthoritySource = {
    name: 'synthetic/authorities.xml', uri: 'https://example.test/authorities.xml',
    xml: await Bun.file(new URL('../../../fixtures/synthetic/authorities.xml', import.meta.url)).text(),
};
const mapping: Mapping = {
    partKinds: { prose: 'prose' },
    entityKinds: { person: 'person', place: 'place', org: 'organization', event: 'event', work: 'work', unknown: 'unknown' },
    authorityDocuments: Object.fromEntries(['person', 'place', 'organization', 'event', 'work', 'unknown'].map(kind => [kind, authority.uri])),
};
const source = (body: string) => ({ name: 'document.xml', uri: 'https://example.test/document.xml', xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="document"><teiHeader><fileDesc><titleStmt><title>Sample</title></titleStmt></fileDesc></teiHeader><text><body><div type="prose"><p>${body}</p></div></body></text></TEI>` });
const register = (entries: string): AuthoritySource => ({ name: 'register.xml', uri: authority.uri, xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body>${entries}</body></text></TEI>` });

test('supplied authority entries provide labels without creating documents or changing mentions', () => {
    const input = source('<rs type="person" ref="#person1">I</rs> <rs type="place" ref="#place1">here</rs> <rs type="org" ref="#org1">we</rs> <rs type="event" ref="#event1">the meeting</rs> <rs type="work" ref="#work1">my work</rs>');
    const plain = compile([input], mapping), enriched = compile([input], mapping, { authorities: [authority] });
    expect(enriched.documents).toEqual(plain.documents);
    expect(enriched.documents).toHaveLength(1);
    expect(enriched.mentions).toEqual(plain.mentions);
    expect(enriched.entities.map(e => e.id)).toEqual(plain.entities.map(e => e.id));
    expect(enriched.entities.map(e => e.label)).toEqual(['Ada Example', 'Example Town', 'Example Society', 'Example Gathering', 'Example Work']);
    expect(enriched.entities.every(e => e.resolution === 'external')).toBe(true);
    expect(plain.entities.every(e => e.label === undefined)).toBe(true);
    expect(enriched.diagnostics).toEqual([]);
    expect(EditionSchema.safeParse(JSON.parse(JSON.stringify(enriched))).success).toBe(true);
    const index = createSourceIndex(authority);
    for (const e of enriched.entities) expect(index.resolve(e.provenance)?.getAttribute('xml:id')).toBe(e.authorityRef.split('#')[1]);
});

test('only referenced identities are materialized and unrelated URIs remain external', () => {
    const result = compile([source('<rs type="person" ref="#person1">I</rs> <rs type="person" ref="https://other.test/authorities.xml#person1">Someone else</rs>')], mapping, { authorities: [authority] });
    expect(result.entities).toHaveLength(2);
    expect(result.entities[0].label).toBe('Ada Example');
    expect(result.entities[1].label).toBeUndefined();
    expect(result.entities[1].provenance.source).toBe('document.xml');
});

test('ambiguous or missing authority labels stay unset with source diagnostics', () => {
    const input = register('<listPerson><person xml:id="person1"><persName>Ada Example</persName><persName>A. Example</persName></person><person xml:id="person2"/></listPerson>');
    const result = compile([source('<rs type="person" ref="#person1">I</rs> <rs type="person" ref="#person2">you</rs>')], mapping, { authorities: [input] });
    expect(result.entities.every(e => e.label === undefined)).toBe(true);
    expect(result.diagnostics.map(d => d.code)).toEqual(['ambiguous-authority-label', 'missing-authority-label']);
    expect(result.entities[0].provenance.source).toBe(input.name);
});

test('duplicate equivalent labels are harmless and nested descriptive names are not candidates', () => {
    const input = register('<listPerson><person xml:id="person1"><persName>Ada Example</persName><persName>Ada Example</persName><note><persName>Another person</persName></note></person></listPerson>');
    const result = compile([source('<rs type="person" ref="#person1">I</rs>')], mapping, { authorities: [input] });
    expect(result.entities[0].label).toBe('Ada Example');
    expect(result.diagnostics).toEqual([]);
});

test('authority kinds supplement unknown occurrences and diagnose contradictions', () => {
    const unknown = compile([source('<rs type="unknown" ref="#person1">I</rs>')], mapping, { authorities: [authority] });
    expect(unknown.entities[0].kind).toBe('person');
    const conflict = compile([source('<rs type="place" ref="#person1">there</rs>')], mapping, { authorities: [authority] });
    expect(conflict.entities[0].kind).toBe('unknown');
    expect(conflict.entities[0].label).toBe('Ada Example');
    expect(conflict.diagnostics.map(d => d.code)).toEqual(['authority-kind-conflict']);
    expect(conflict.diagnostics[0].provenance.source).toBe(authority.name);
});

test('missing IDs and unsupported register shapes are diagnosed', () => {
    const missing = compile([source('Text')], mapping, { authorities: [register('<listPerson><person><persName>Ada</persName></person></listPerson>')] });
    expect(missing.diagnostics[0].code).toBe('authority-record-without-id');
    const empty = compile([source('Text')], mapping, { authorities: [register('<list><item xml:id="person1">Ada</item></list>')] });
    expect(empty.diagnostics[0].code).toBe('no-authority-records');
});

test('authority source identity must be explicit and unambiguous', () => {
    expect(() => compile([source('')], mapping, { authorities: [{ ...authority, uri: '' }] })).toThrow('explicit absolute URI');
    expect(() => compile([source('')], mapping, { authorities: [{ ...authority, uri: 'relative.xml' }] })).toThrow();
    expect(() => compile([source('')], mapping, { authorities: [{ ...authority, uri: authority.uri + '#person1' }] })).toThrow('fragment');
    expect(() => compile([source('')], mapping, { authorities: [authority, { ...authority, name: 'other.xml' }] })).toThrow('Duplicate authority source URI');
    expect(() => compile([source('')], mapping, { authorities: [{ ...authority, name: 'document.xml' }] })).toThrow('Duplicate source name');
});

test('the CLI reads explicitly supplied authorities without emitting them as documents', async () => {
    const temp = await import('node:fs/promises');
    const directory = await temp.mkdtemp('/tmp/tei-authorities-');
    const path = `${directory}/document.xml`;
    await Bun.write(path, source('<rs type="person" ref="https://example.test/authorities.xml#person1">I</rs>').xml);
    const outputPath = `${directory}/edition.json`;
    const process = Bun.spawn(['bun', 'packages/compiler/src/cli.ts', path, '--authority', authority.uri, 'fixtures/synthetic/authorities.xml'], { stdout: Bun.file(outputPath), stderr: 'pipe' });
    const [stderr, exit] = await Promise.all([new Response(process.stderr).text(), process.exited]);
    const stdout = await Bun.file(outputPath).text();
    expect({ exit, stderr }).toEqual({ exit: 0, stderr: '' });
    const edition = EditionSchema.parse(JSON.parse(stdout));
    expect(edition.documents).toHaveLength(1);
    expect(edition.entities[0].label).toBe('Ada Example');
    await temp.rm(directory, { recursive: true });
});

test('authority document identity cannot carry an empty fragment marker', () => {
    expect(() => compile([source('')], mapping, { authorities: [{ ...authority, uri: authority.uri + '#' }] })).toThrow('fragment');
});

test('explicit authority label types select preferred forms without guessing among alternatives', () => {
    const input = register('<listPerson><person xml:id="person1"><persName><forename>Richard</forename><surname>Example</surname></persName><persName type="legacy">Example, Richard</persName><persName type="pseudonym">R.</persName></person></listPerson>');
    const sourceInput = source('<rs type="person" ref="#person1">Richard</rs>');
    const ambiguous = compile([sourceInput], mapping, { authorities: [input] });
    expect(ambiguous.entities[0].label).toBeUndefined();
    expect(ambiguous.diagnostics[0].code).toBe('ambiguous-authority-label');
    const preferred = compile([sourceInput], { ...mapping, authorityLabelTypes: { person: [''] } }, { authorities: [input] });
    expect(preferred.entities[0].label).toBe('Richard Example');
    expect(preferred.mentions).toEqual(ambiguous.mentions);
    expect(preferred.entities[0].provenance).toEqual(ambiguous.entities[0].provenance);
    expect(preferred.diagnostics).toEqual([]);
    const pseudonym = compile([sourceInput], { ...mapping, authorityLabelTypes: { person: ['pseudonym'] } }, { authorities: [input] });
    expect(pseudonym.entities[0].label).toBe('R.');
});

test('configured label types remain conservative when no label or several distinct labels match', () => {
    const input = register('<listPerson><person xml:id="person1"><persName type="preferred">Ada</persName><persName type="preferred">Adele</persName></person></listPerson>');
    const sourceInput = source('<rs type="person" ref="#person1">A.</rs>');
    for (const [types, code] of [[['preferred'], 'ambiguous-authority-label'], [['missing'], 'missing-authority-label']] as const) {
        const result = compile([sourceInput], { ...mapping, authorityLabelTypes: { person: [...types] } }, { authorities: [input] });
        expect(result.entities[0].label).toBeUndefined();
        expect(result.diagnostics[0].code).toBe(code);
    }
});

test('bibliographies nested inside authority descriptions are not independent work registers', () => {
    const input = register('<listPerson><person xml:id="person1"><persName>Ada Example</persName><listBibl><bibl>A reference without an identity</bibl><bibl xml:id="embedded"><title>Descriptive bibliography</title></bibl></listBibl></person></listPerson><listBibl><bibl xml:id="work1"><title>Independent work</title></bibl></listBibl>');
    const result = compile([source('<rs type="person" ref="#person1">Ada</rs> <rs type="work" ref="#work1">the work</rs> <rs type="work" ref="#embedded">a citation</rs>')], mapping, { authorities: [input] });
    expect(result.diagnostics).toEqual([]);
    expect(result.entities.map(e => e.label)).toEqual(['Ada Example', 'Independent work', undefined]);
    expect(result.entities[1].provenance.selector).toBe('id("work1")');
    expect(result.entities[2].provenance.source).toBe('document.xml');
});
