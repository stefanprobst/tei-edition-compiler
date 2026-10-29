import { createHash } from 'node:crypto';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deepStrictEqual } from 'node:assert';

// Explicit local integration check: compilation never fetches sources or images.
const root = resolve(new URL('../../../', import.meta.url).pathname);
const input = 'packages/site/dist/amp-input';
const temporary = await mkdtemp(join(tmpdir(), 'tei-edition-reproduce-'));
const run = async (script: string, args: string[] = []) => {
    const process = Bun.spawn([Bun.which('bun') ?? 'bun', script, ...args], { cwd: root, stdout: 'pipe', stderr: 'pipe' });
    const [stdout, stderr, code] = await Promise.all([new Response(process.stdout).text(), new Response(process.stderr).text(), process.exited]);
    if (stdout) console.error(stdout.trimEnd());
    if (stderr) console.error(stderr.trimEnd());
    if (code !== 0) throw new Error(`Reproduction step failed: ${script} (${code})`);
};
const digest = async (path: string) => createHash('sha256').update(await Bun.file(path).bytes()).digest('hex');
const build = async (name: string) => {
    const output = join(temporary, name);
    await run('packages/compiler/scripts/audit-auden-corpus.ts');
    await run('packages/site/scripts/build.ts', [input + '/edition.json', input + '/manifest.json', input + '/site.json', output]);
    await run('packages/site/scripts/verify-auden-site.ts', [output]);
    const hashes: Record<string, string> = {};
    for (const file of ['edition.json', 'manifest.json', 'site.json', 'audit.json']) hashes['input/' + file] = await digest(join(root, input, file));
    for (const file of (await readdir(output)).sort()) hashes['public/' + file] = await digest(join(output, file));
    return hashes;
};
try {
    const first = await build('first'), second = await build('second');
    deepStrictEqual(second, first, 'Clean publication builds differ');
    console.log(JSON.stringify({ reproducible: true, comparedFiles: Object.keys(first).length, builds: 2, networkRequests: 0 }));
} finally {
    await rm(temporary, { recursive: true, force: true });
}
