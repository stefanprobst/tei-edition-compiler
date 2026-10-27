import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { MappingSchema, MappingProfileSchema, audenMusulinMapping, compile, compileWithManifest, verifyCompilationManifest, type Mapping } from '../src';
import { EditionSchema, partLanguageRuns, projectDocumentText } from '@acdh-oeaw/tei-edition-ir';
const profilePath = 'fixtures/synthetic/generic-mapping.json';
const documentPath = 'fixtures/synthetic/generic-edition.xml';
const authorityPath = 'fixtures/synthetic/authorities.xml';
const profile = MappingProfileSchema.parse(await Bun.file(profilePath).json());
const document = { name: documentPath, xml: await Bun.file(documentPath).text() };
const authority = { name: authorityPath, uri: 'https://example.test/authorities.xml', xml: await Bun.file(authorityPath).text() };

async function temporary(run: (directory: string) => Promise<void>) {
    const directory = await mkdtemp('/tmp/tei-mapping-');
    try { await run(directory); } finally { await rm(directory, { recursive: true }); }
}
async function cli(directory: string, args: string[]) {
    const output = `${directory}/stdout.json`, error = `${directory}/stderr.txt`;
    const child = Bun.spawn(['bun', 'packages/compiler/src/cli.ts', ...args], { stdout: Bun.file(output), stderr: Bun.file(error) });
    const exit = await child.exited;
    return { exit, output: await Bun.file(output).text(), error: await Bun.file(error).text() };
}

test('the bundled Auden JSON profile preserves the default mapping and all fixture output', async () => {
    const bundled = MappingProfileSchema.parse(await Bun.file('packages/compiler/profiles/auden-musulin.json').json());
    expect(bundled.mapping).toEqual(audenMusulinMapping);
    const sources = await Promise.all(['0001', '0040', '0078', '0028', '0062'].map(async n => {
        const name = `amp-transcript__${n}.xml`;
        return { name, xml: await Bun.file(`fixtures/auden-musulin/${name}`).text() };
    }));
    expect(compile(sources, bundled.mapping)).toEqual(compile(sources));
});

test('strict profile validation rejects invalid versions, keys, values and base URIs', () => {
    const empty = { partKinds: {}, entityKinds: {} };
    for (const candidate of [
        { version: '2', mapping: empty }, { version: '1', mapping: empty, plugins: [] },
        { version: '1', mapping: { ...empty, misspelled: true } },
        { version: '1', mapping: { ...empty, partKinds: { memo: '' } } },
        { version: '1', mapping: { ...empty, entityKinds: { human: 'project-specific-person' } } },
        { version: '1', mapping: { ...empty, authorityDocuments: { human: 'people.xml' } } },
        { version: '1', mapping: { ...empty, documentBaseUri: 'relative/' } },
        { version: '1', mapping: { ...empty, documentBaseUri: 'https://example.test/#fragment' } },
    ]) expect(MappingProfileSchema.safeParse(candidate).success).toBe(false);
    expect(() => compile([document], JSON.parse('{"partKinds":{},"entityKinds":{"human":42}}') as Mapping)).toThrow();
    expect(MappingSchema.safeParse(empty).success).toBe(true);
});

test('a second project compiles direct body text and verse with custom entity categories', () => {
    const edition = compile([document], profile.mapping, { authorities: [authority] });
    const result = edition.documents[0];
    expect(result.parts.map(p => p.kind)).toEqual(['text', 'verse']);
    expect(result.parts[1].parentId).toBe(result.parts[0].id);
    expect(result.metadata.dates).toEqual([{ kind: 'exact', value: '1900', label: '1900' }]);
    expect(edition.entities.map(e => [e.kind, e.label])).toEqual([['person', 'Ada Example'], ['place', 'Example Town']]);
    expect(edition.mentions.map(m => m.label)).toEqual(['A.', 'here']);
    expect(edition.resources[0].uri).toBe('https://example.test/edition/images/front.jpg');
    expect(partLanguageRuns(edition, result.parts[1].id)[0].language).toBe('de');
    const projection = projectDocumentText(edition, result.id, { deletionText: 'omit', spacing: 'characters' });
    expect(projection.text).toContain('neues Wort.');
    expect(projection.text).not.toContain('altes');
    expect(edition.relations.find(r => r.predicate === 'references')?.externalTargets?.[0].sourceId).toBe('https://example.test/edition/other.xml');
    expect(edition.diagnostics).toEqual([]);
    expect(JSON.stringify(edition)).not.toContain('auden-musulin');
});

test('only declared own mapping entries match source values', () => {
    const input = { name: 'own.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><title>Own entries</title></teiHeader><text><body><div type="constructor">Text</div></body></text></TEI>' };
    const unconfigured = compile([input], profile.mapping);
    expect(unconfigured.documents[0].parts.map(p => p.kind)).toEqual(['text']);
    const explicit = MappingSchema.parse({ ...profile.mapping, partKinds: JSON.parse('{"constructor":"custom"}') });
    expect(compile([input], explicit).documents[0].parts.map(p => p.kind)).toEqual(['text', 'custom']);
});

test('the CLI applies custom profiles with authorities and an integrity manifest', async () => {
    await temporary(async directory => {
        const manifestPath = `${directory}/manifest.json`;
        const result = await cli(directory, [documentPath, '--mapping', profilePath, '--authority', authority.uri, authorityPath, '--manifest', manifestPath]);
        expect({ exit: result.exit, error: result.error }).toEqual({ exit: 0, error: '' });
        const edition = EditionSchema.parse(JSON.parse(result.output));
        expect(edition.documents[0].parts.map(p => p.kind)).toEqual(['text', 'verse']);
        const manifest = await Bun.file(manifestPath).json();
        expect(() => verifyCompilationManifest(edition, manifest)).not.toThrow();
        expect(manifest.mappingSha256).toBe(compileWithManifest([document], profile.mapping, { authorities: [authority] }).manifest.mappingSha256);
    });
});

test('invalid profiles fail before emitting JSON or a manifest', async () => {
    await temporary(async directory => {
        const path = `${directory}/invalid.json`, manifestPath = `${directory}/manifest.json`;
        await Bun.write(path, JSON.stringify({ version: '2', mapping: profile.mapping }));
        const result = await cli(directory, [documentPath, '--mapping', path, '--manifest', manifestPath]);
        expect(result.exit).not.toBe(0); expect(result.output).toBe('');
        expect(await Bun.file(manifestPath).exists()).toBe(false);
    });
});

test('manifest output cannot replace the mapping profile input', async () => {
    await temporary(async directory => {
        const path = `${directory}/profile.json`, text = JSON.stringify(profile);
        await Bun.write(path, text);
        const result = await cli(directory, [documentPath, '--mapping', path, '--manifest', path]);
        expect(result.exit).not.toBe(0);
        expect(await Bun.file(path).text()).toBe(text);
    });
});

test('configured document bases reject empty fragments and encode literal fallback names', () => {
    expect(MappingSchema.safeParse({ partKinds: {}, entityKinds: {}, documentBaseUri: 'https://example.test/#' }).success).toBe(false);
    const input = { name: 'draft#1?.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><title>Literal filename</title></teiHeader><text><body><p>Text</p></body></text></TEI>' };
    const edition = compile([input], profile.mapping);
    expect(edition.documents).toHaveLength(1);
    expect(edition.diagnostics).toEqual([]);
});

test('authority-document scopes cannot silently replace an existing fragment', () => {
    for (const uri of ['people.xml#section', 'https://example.test/people.xml#']) {
        expect(MappingSchema.safeParse({ partKinds: {}, entityKinds: {}, authorityDocuments: { person: uri } }).success).toBe(false);
    }
    expect(MappingSchema.safeParse({ partKinds: {}, entityKinds: {}, authorityDocuments: { person: 'https://example.test/people%23register.xml' } }).success).toBe(true);
});

test('authority label type rules are strict and permit explicit untyped names', () => {
    expect(MappingProfileSchema.safeParse({ version: '1', mapping: { partKinds: {}, entityKinds: {}, authorityLabelTypes: { person: [''] } } }).success).toBe(true);
    for (const authorityLabelTypes of [{ person: [] }, { person: [1] }, { unknownKind: ['preferred'] }]) {
        expect(MappingProfileSchema.safeParse({ version: '1', mapping: { partKinds: {}, entityKinds: {}, authorityLabelTypes } }).success).toBe(false);
    }
});
