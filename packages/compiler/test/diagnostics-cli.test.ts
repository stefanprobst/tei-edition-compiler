import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';
import { verifyCompilationManifest } from '../src';
const xml = (body: string) => '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>Diagnostics</title></titleStmt></fileDesc></teiHeader><text><body><div type="letter">' + body + '</div></body></text></TEI>';
async function temporary(run: (directory: string) => Promise<void>) {
    const directory = await mkdtemp('/tmp/tei-diagnostics-');
    try { await run(directory); } finally { await rm(directory, { recursive: true }); }
}
async function cli(directory: string, args: string[]) {
    const output = directory + '/stdout.json', error = directory + '/stderr.txt';
    const child = Bun.spawn(['bun', 'packages/compiler/src/cli.ts', ...args], { stdout: Bun.file(output), stderr: Bun.file(error) });
    const exit = await child.exited;
    return { exit, output: await Bun.file(output).text(), error: await Bun.file(error).text() };
}

test('default CLI behavior retains diagnostics and a successful exit', async () => {
    await temporary(async directory => {
        const source = directory + '/source.xml';
        await Bun.write(source, xml('<choice><sic>original</sic><corr>corrected</corr></choice>'));
        const result = await cli(directory, [source]);
        expect(result.exit).toBe(0); expect(result.error).toBe('');
        expect(EditionSchema.parse(JSON.parse(result.output)).diagnostics.map(d => d.code)).toEqual(['unsupported-text-alternatives']);
    });
});

test('diagnostic failure preserves validated IR and a matching manifest', async () => {
    await temporary(async directory => {
        const source = directory + '/source.xml', manifestPath = directory + '/manifest.json';
        await Bun.write(source, xml('<choice><sic>original</sic><corr>corrected</corr></choice><pb facs="#missing"/>'));
        const result = await cli(directory, ['--fail-on-diagnostics', source, '--manifest', manifestPath]);
        expect(result.exit).toBe(1);
        expect(result.error).toBe('Compilation produced 2 diagnostic(s): unresolved-facsimile=1, unsupported-text-alternatives=1\n');
        const edition = EditionSchema.parse(JSON.parse(result.output));
        expect(edition.diagnostics).toHaveLength(2);
        expect(edition.diagnostics.every(d => d.provenance.source === source)).toBe(true);
        const manifest = await Bun.file(manifestPath).json();
        expect(() => verifyCompilationManifest(edition, manifest)).not.toThrow();
    });
});

test('a clean compilation remains successful in build-check mode', async () => {
    await temporary(async directory => {
        const result = await cli(directory, ['fixtures/synthetic/generic-edition.xml', '--mapping', 'fixtures/synthetic/generic-mapping.json', '--authority', 'https://example.test/authorities.xml', 'fixtures/synthetic/authorities.xml', '--fail-on-diagnostics']);
        expect({ exit: result.exit, error: result.error }).toEqual({ exit: 0, error: '' });
        expect(EditionSchema.parse(JSON.parse(result.output)).diagnostics).toEqual([]);
    });
});

test('the complete pinned slice fails explicitly on its nine known interpretation diagnostics', async () => {
    await temporary(async directory => {
        const paths = ['0001', '0040', '0078', '0028', '0062'].map(n => 'fixtures/auden-musulin/amp-transcript__' + n + '.xml');
        const result = await cli(directory, [...paths, '--fail-on-diagnostics']);
        expect(result.exit).toBe(1);
        expect(result.error).toBe('Compilation produced 9 diagnostic(s): unresolved-interpretation=9\n');
        const edition = EditionSchema.parse(JSON.parse(result.output));
        expect(edition.documents).toHaveLength(5);
        expect(edition.diagnostics).toHaveLength(9);
    });
});

test('fatal XML errors emit neither edition JSON nor a new manifest', async () => {
    await temporary(async directory => {
        const source = directory + '/source.xml', manifestPath = directory + '/manifest.json';
        await Bun.write(source, '<TEI>');
        const result = await cli(directory, [source, '--fail-on-diagnostics', '--manifest', manifestPath]);
        expect(result.exit).not.toBe(0);
        expect(result.output).toBe('');
        expect(result.error).toContain('Invalid XML');
        expect(await Bun.file(manifestPath).exists()).toBe(false);
    });
});
