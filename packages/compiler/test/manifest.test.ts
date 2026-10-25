import { expect, test } from 'bun:test';
import { mkdtemp, rm, symlink, link } from 'node:fs/promises';
import { compile, compileWithManifest, createSourceIndex, verifyCompilationManifest, verifyCompilationSources, CompilationManifestSchema, type Mapping, type Source } from '../src';
import { fingerprintJson } from '../src/fingerprints';
import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';

const source: Source = { name: 'source.xml', uri: 'https://example.test/source.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="source"><teiHeader><fileDesc><titleStmt><title>Manifest</title></titleStmt></fileDesc></teiHeader><text><body><div type="letter" xml:id="letter">Original</div></body></text></TEI>' };
const mapping: Mapping = { partKinds: { letter: 'letter', poem: 'poem' }, entityKinds: { person: 'person', place: 'place' } };

test('saved compilation sources verify completely without recompilation', async () => {
    const authority = { name: 'authority.xml', uri: 'https://example.test/authority.xml', xml: await Bun.file('fixtures/synthetic/authorities.xml').text() };
    const { edition, manifest } = compileWithManifest([source], mapping, { authorities: [authority] });
    const saved = EditionSchema.parse(JSON.parse(JSON.stringify(edition)));
    expect(verifyCompilationSources(saved, manifest, [authority, source])).toMatchObject({ verifiedSources: 2 });
    expect(verifyCompilationSources(saved, manifest, [source, authority]).verifiedProvenanceRecords).toBeGreaterThan(0);
    expect(() => verifyCompilationSources(saved, manifest, [source])).toThrow('Missing supplied source authority.xml');
    expect(() => verifyCompilationSources(saved, manifest, [source, source, authority])).toThrow('Duplicate supplied source');
    expect(() => verifyCompilationSources(saved, manifest, [source, authority, { ...source, name: 'extra.xml' }])).toThrow('absent from compilation manifest');
    expect(() => verifyCompilationSources(saved, manifest, [source, { ...authority, xml: authority.xml + '\n' }])).toThrow('Source hash mismatch');
    expect(() => verifyCompilationSources(saved, manifest, [{ ...source, xml: source.xml.replace('Original', 'Changed') }, authority])).toThrow('Source hash mismatch');
    saved.documents[0].provenance.selector = 'id("missing")';
    expect(() => verifyCompilationSources(saved, manifest, [source, authority])).toThrow('Edition does not match');
    const rebound = { ...manifest, editionSha256: fingerprintJson(saved) };
    expect(() => verifyCompilationSources(saved, rebound, [source, authority])).toThrow('Unresolved provenance');
});
async function temporary(run: (directory: string) => Promise<void>) {
    const directory = await mkdtemp('/tmp/tei-manifest-');
    try { await run(directory); } finally { await rm(directory, { recursive: true }); }
}
async function cli(directory: string, args: string[]) {
    const stdout = `${directory}/stdout.json`, stderr = `${directory}/stderr.txt`;
    const child = Bun.spawn(['bun', 'packages/compiler/src/cli.ts', ...args], { stdout: Bun.file(stdout), stderr: Bun.file(stderr) });
    const exit = await child.exited;
    return { exit, stdout: await Bun.file(stdout).text(), stderr: await Bun.file(stderr).text() };
}

test('verification CLI accepts relocated explicit inputs and emits counts only on complete success', async () => {
    await temporary(async directory => {
        const authority = { name: 'unavailable/authority.xml', uri: 'https://example.test/authority.xml', xml: await Bun.file('fixtures/synthetic/authorities.xml').text() };
        const bundle = compileWithManifest([source], mapping, { authorities: [authority] });
        await Bun.write(directory + '/edition.json', JSON.stringify(bundle.edition));
        await Bun.write(directory + '/manifest.json', JSON.stringify(bundle.manifest));
        await Bun.write(directory + '/relocated.xml', source.xml);
        await Bun.write(directory + '/register.xml', authority.xml);
        const args = [directory + '/edition.json', directory + '/manifest.json', '--source', source.name, directory + '/relocated.xml', '--source', authority.name, directory + '/register.xml'];
        let invocation = 0;
        const run = async (input: string[]) => {
            const prefix = directory + '/verify-' + invocation++;
            const output = prefix + '.stdout', errors = prefix + '.stderr';
            const child = Bun.spawn(['bun', 'packages/compiler/src/verify-cli.ts', ...input], { stdout: Bun.file(output), stderr: Bun.file(errors) });
            const exit = await child.exited;
            const [stdout, stderr] = await Promise.all([Bun.file(output).text(), Bun.file(errors).text()]);
            return { exit, stdout, stderr };
        };
        const valid = await run(args);
        expect(valid.stderr).toBe('');
        expect(valid.exit).toBe(0);
        expect(JSON.parse(valid.stdout)).toEqual(verifyCompilationSources(bundle.edition, bundle.manifest, [source, authority]));
        const missing = await run(args.slice(0, 5));
        expect(missing.exit).toBe(1);
        expect(missing.stdout).toBe('');
        expect(missing.stderr).toContain('Missing supplied source');
        await Bun.write(directory + '/register.xml', authority.xml + '\n');
        const changed = await run(args);
        expect(changed.exit).toBe(1);
        expect(changed.stdout).toBe('');
        expect(changed.stderr).toContain('Source hash mismatch');
        const malformed = await run([...args, '--source', 'incomplete']);
        expect(malformed.exit).toBe(1);
        expect(malformed.stdout).toBe('');
        expect(malformed.stderr).toContain('Usage:');
    });
});

test('the manifest binds a deterministic edition and mapping without changing IR', () => {
    const bundle = compileWithManifest([source], mapping);
    expect(bundle.edition).toEqual(compile([source], mapping));
    expect(bundle.manifest).toEqual(compileWithManifest([source], mapping).manifest);
    expect(bundle.manifest.sources[0]).toMatchObject({ name: source.name, uri: source.uri, role: 'document' });
    expect(bundle.manifest.sources[0].sha256).toBe(createSourceIndex(source).sha256);
    expect(() => verifyCompilationManifest(bundle.edition, bundle.manifest)).not.toThrow();
    expect(() => verifyCompilationManifest(JSON.parse(JSON.stringify(bundle.edition, null, 2)), bundle.manifest)).not.toThrow();
    const reordered: Mapping = { entityKinds: { place: 'place', person: 'person' }, partKinds: { poem: 'poem', letter: 'letter' } };
    expect(compileWithManifest([source], reordered).manifest.mappingSha256).toBe(bundle.manifest.mappingSha256);
    const changed = { ...mapping, entityKinds: { person: 'person' as const } };
    expect(compileWithManifest([source], changed).manifest.mappingSha256).not.toBe(bundle.manifest.mappingSha256);
});

test('hash verification rejects changed source text even when IDs and selectors still exist', () => {
    const { manifest } = compileWithManifest([source], mapping);
    const sha256 = manifest.sources[0].sha256;
    expect(createSourceIndex(source, { expectedSha256: sha256.toUpperCase() }).resolve('id("letter")')?.textContent).toBe('Original');
    const changed = { ...source, xml: source.xml.replace('Original', 'Changed') };
    expect(createSourceIndex(changed).resolve('id("letter")')?.textContent).toBe('Changed');
    expect(() => createSourceIndex(changed, { expectedSha256: sha256 })).toThrow('Source hash mismatch');
    expect(() => createSourceIndex(source, { expectedSha256: 'bad-hash' })).toThrow('64 hexadecimal');
    expect(() => createSourceIndex({ ...source, xml: '<broken' }, { expectedSha256: sha256 })).toThrow('Source hash mismatch');
});

test('edited editions and unsupported manifest versions are rejected', () => {
    const { edition, manifest } = compileWithManifest([source], mapping);
    const changed = structuredClone(edition);
    changed.documents[0].metadata.title = 'Different';
    expect(() => verifyCompilationManifest(changed, manifest)).toThrow('Edition does not match');
    const other = JSON.parse(JSON.stringify(manifest)); other.version = '2';
    expect(() => verifyCompilationManifest(edition, other)).toThrow('version');
});

test('explicit authority inputs participate in the integrity record', async () => {
    const authority = { name: 'authorities.xml', uri: 'https://example.test/authorities.xml', xml: await Bun.file('fixtures/synthetic/authorities.xml').text() };
    const bundle = compileWithManifest([source], mapping, { authorities: [authority] });
    expect(bundle.manifest.sources.map(s => s.role)).toEqual(['document', 'authority']);
    expect(bundle.manifest.sources[1]).toMatchObject({ name: authority.name, uri: authority.uri, sha256: createSourceIndex(authority).sha256 });
    const changed = { ...authority, xml: authority.xml.replace('Ada', 'Bea') };
    expect(compileWithManifest([source], mapping, { authorities: [changed] }).manifest.sources[1].sha256).not.toBe(bundle.manifest.sources[1].sha256);
});

test('all pinned fixture hashes match the compiled-source manifest', async () => {
    const fixtureManifest = await Bun.file('fixtures/auden-musulin/manifest.json').json();
    const sources = await Promise.all(Object.keys(fixtureManifest.files).map(async name => ({ name, xml: await Bun.file(`fixtures/auden-musulin/${name}`).text() })));
    const bundle = compileWithManifest(sources);
    for (const entry of bundle.manifest.sources) expect(entry.sha256).toBe(fixtureManifest.files[entry.name]);
    expect(() => verifyCompilationManifest(bundle.edition, bundle.manifest)).not.toThrow();
});

test('the CLI writes a separate manifest with clean edition JSON on stdout', async () => {
    await temporary(async directory => {
        const path = `${directory}/source.xml`, manifestPath = `${directory}/manifest.json`;
        await Bun.write(path, source.xml);
        const result = await cli(directory, [path, '--manifest', manifestPath]);
        expect({ exit: result.exit, stderr: result.stderr }).toEqual({ exit: 0, stderr: '' });
        const edition = EditionSchema.parse(JSON.parse(result.stdout));
        const manifest = await Bun.file(manifestPath).json();
        expect(manifest.sources[0].name).toBe(path);
        expect(() => verifyCompilationManifest(edition, manifest)).not.toThrow();
        expect(createSourceIndex({ name: path, xml: await Bun.file(path).text() }, { expectedSha256: manifest.sources[0].sha256 }).resolve('id("letter")')?.textContent).toBe('Original');
    });
});

test('manifest output cannot overwrite a document through its path, symlink or hard link', async () => {
    await temporary(async directory => {
        const path = `${directory}/source.xml`, symbolic = `${directory}/symbolic.json`, hard = `${directory}/hard.json`;
        await Bun.write(path, source.xml);
        await symlink(path, symbolic); await link(path, hard);
        for (const destination of [path, symbolic, hard]) {
            const result = await cli(directory, [path, '--manifest', destination]);
            expect(result.exit).not.toBe(0);
            expect(result.stderr).toContain('must not overwrite a canonical source');
            expect(await Bun.file(path).text()).toBe(source.xml);
        }
    });
});

test('manifest output also protects authority inputs', async () => {
    await temporary(async directory => {
        const path = `${directory}/source.xml`, authorityPath = `${directory}/authority.xml`;
        await Bun.write(path, source.xml);
        const authority = await Bun.file('fixtures/synthetic/authorities.xml').text();
        await Bun.write(authorityPath, authority);
        const result = await cli(directory, [path, '--authority', 'https://example.test/authorities.xml', authorityPath, '--manifest', authorityPath]);
        expect(result.exit).not.toBe(0);
        expect(await Bun.file(authorityPath).text()).toBe(authority);
    });
});

test('manifest verification rejects malformed metadata despite a matching edition hash', () => {
    const { edition, manifest } = compileWithManifest([source], mapping);
    for (const changed of [
        { ...manifest, mappingSha256: 'not-a-hash' },
        { ...manifest, unexpected: true },
        { ...manifest, sources: [{ ...manifest.sources[0], sha256: 'invalid' }] },
        { ...manifest, sources: [{ ...manifest.sources[0], name: '' }] },
        { ...manifest, sources: [{ ...manifest.sources[0], uri: 'relative.xml' }] },
        { ...manifest, sources: [{ ...manifest.sources[0], uri: source.uri + '#fragment' }] },
        { ...manifest, sources: [manifest.sources[0], manifest.sources[0]] },
        null,
    ]) expect(() => verifyCompilationManifest(edition, changed)).toThrow();
});

test('every actual provenance source must be present and document roles must match', () => {
    const { edition, manifest } = compileWithManifest([source], mapping);
    expect(() => verifyCompilationManifest(edition, { ...manifest, sources: [] })).toThrow('missing provenance source');
    expect(() => verifyCompilationManifest(edition, { ...manifest, sources: [{ ...manifest.sources[0], name: 'other.xml' }] })).toThrow('missing provenance source');
    expect(() => verifyCompilationManifest(edition, { ...manifest, sources: [{ ...manifest.sources[0], role: 'authority' }] })).toThrow('Document provenance');
    expect(() => verifyCompilationManifest(edition, { ...manifest, sources: [{ ...manifest.sources[0], role: 'authority', uri: undefined }] })).toThrow('Authority sources require');
});

test('verification returns normalized validated metadata without mutating the sidecar', () => {
    const { edition, manifest } = compileWithManifest([source], mapping);
    const uppercase = {
        ...manifest, editionSha256: manifest.editionSha256.toUpperCase(),
        mappingSha256: manifest.mappingSha256.toUpperCase(),
        sources: manifest.sources.map(s => ({ ...s, sha256: s.sha256.toUpperCase() })),
    };
    const before = JSON.stringify(uppercase);
    const verified = verifyCompilationManifest(edition, uppercase);
    expect(verified).toEqual(manifest);
    expect(JSON.stringify(uppercase)).toBe(before);
});

test('authority diagnostics require their source entry even without materialized entities', async () => {
    const authority = { name: 'register.xml', uri: 'https://example.test/register.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><text><body><listPerson><person xml:id="unused"/></listPerson></body></text></TEI>' };
    const { edition, manifest } = compileWithManifest([source], mapping, { authorities: [authority] });
    expect(edition.diagnostics.some(d => d.provenance.source === authority.name)).toBe(true);
    expect(() => verifyCompilationManifest(edition, { ...manifest, sources: manifest.sources.filter(s => s.role === 'document') })).toThrow('missing provenance source register.xml');
});

test('manifest safeParse reports malformed URIs without throwing', () => {
    const { manifest } = compileWithManifest([source], mapping);
    for (const uri of ['relative.xml', 'https://[', 'https://example.test/#']) {
        const changed = { ...manifest, sources: [{ ...manifest.sources[0], uri }] };
        expect(() => CompilationManifestSchema.safeParse(changed)).not.toThrow();
        expect(CompilationManifestSchema.safeParse(changed).success).toBe(false);
    }
});
