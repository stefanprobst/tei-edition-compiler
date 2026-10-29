import { createHash } from 'node:crypto';
import { mkdir, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { generateSite, type SiteOptions } from '../src';
import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';
import { verifyCompilationManifestArtifact } from '@acdh-oeaw/tei-edition-ir/compilation-manifest';

const [basePath, destination] = process.argv.slice(2);
if (!basePath || !destination || process.argv.length !== 4) throw new Error('Usage: bun run amp:release <base-path> <new-output-directory>');
const input = 'packages/site/dist/amp-input';
const edition = EditionSchema.parse(await Bun.file(input + '/edition.json').json());
const manifest = await verifyCompilationManifestArtifact(edition, await Bun.file(input + '/manifest.json').json());
const config: SiteOptions = { ...await Bun.file(input + '/site.json').json(), basePath };
const files = await generateSite(edition, await Bun.file(input + '/manifest.json').json(), config);
const output = resolve(destination);
try {
    if ((await readdir(output)).length) throw new Error('Release destination must be empty: ' + output);
} catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
await mkdir(join(output, 'public'), { recursive: true });
const hashes: Record<string, string> = {};
for (const [name, content] of [...files].sort(([a], [b]) => a.localeCompare(b))) {
    await Bun.write(join(output, 'public', name), content);
    hashes[name] = createHash('sha256').update(content).digest('hex');
}
await Bun.write(join(output, 'site.json'), JSON.stringify(config, null, 2));
await Bun.write(join(output, 'release.json'), JSON.stringify({ version: '1', editionSha256: manifest.editionSha256, basePath, files: hashes }, null, 2));
const check = Bun.spawn([Bun.which('bun') ?? 'bun', 'packages/site/scripts/verify-auden-site.ts', join(output, 'public'), join(output, 'site.json')], { stdout: 'inherit', stderr: 'inherit' });
if (await check.exited !== 0) throw new Error('Release verification failed; inspect the output before publication');
console.log(JSON.stringify({ output, basePath, files: files.size, editionSha256: manifest.editionSha256, published: false }));
