import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { EditionSchema, summarizeEdition } from '@tei-edition/ir';
import { verifyCompilationManifest } from '../src';

test('the pinned interpretation-context cohort compiles offline with no diagnostics', async () => {
    const directory = await mkdtemp('/tmp/tei-closure-');
    try {
        const fixtureManifest = await Bun.file('fixtures/auden-musulin/manifest.json').json();
        const names: string[] = fixtureManifest.cohorts['interpretation-closure'];
        const inputs = names.map(name => 'fixtures/auden-musulin/' + name);
        const output = directory + '/edition.json', manifestPath = directory + '/manifest.json', error = directory + '/stderr.txt';
        const child = Bun.spawn(['bun', 'packages/compiler/src/cli.ts', ...inputs, '--fail-on-diagnostics', '--manifest', manifestPath], { stdout: Bun.file(output), stderr: Bun.file(error) });
        expect(await child.exited).toBe(0);
        expect(await Bun.file(error).text()).toBe('');
        const edition = EditionSchema.parse(await Bun.file(output).json());
        const manifest = verifyCompilationManifest(edition, await Bun.file(manifestPath).json());
        expect(edition.diagnostics).toEqual([]);
        expect(manifest.sources).toHaveLength(10);
        for (const input of manifest.sources) expect(input.sha256).toBe(fixtureManifest.files[input.name.split('/').at(-1)!]);
        const summary = summarizeEdition(edition);
        expect(summary.totals.documents).toBe(10);
        expect(summary.totals.parts).toBe(51);
        expect(summary.totals.anchors).toBe(171);
        expect(summary.annotations.externalAnnotationTargets).toBe(0);
        expect(summary.annotations.byKind['address-line']).toBe(1);
        expect(summary.annotations.byKind.glyph).toBe(1);
        expect(summary.annotations.byKind['glyph-description']).toBe(1);
    } finally { await rm(directory, { recursive: true }); }
});
