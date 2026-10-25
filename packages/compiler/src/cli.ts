import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { compile, compileWithManifest, MappingProfileSchema, type AuthoritySource } from './index';
const usage = 'Usage: bun run compile <source.xml> [...] [--authority <absolute-uri> <authority.xml>] [--manifest <manifest.json>] [--mapping <profile.json>] [--fail-on-diagnostics]';
const paths: string[] = [];
const authorityInputs: { uri: string; name: string }[] = [];
let manifestPath: string | undefined;
let mappingPath: string | undefined;
let failOnDiagnostics = false;
const args = process.argv.slice(2);
for (let i = 0; i < args.length; i++) {
    if (args[i] === '--authority') {
        const uri = args[++i], name = args[++i];
        if (!uri || !name || name.startsWith('--')) throw new Error(usage);
        authorityInputs.push({ uri, name });
    } else if (args[i] === '--fail-on-diagnostics') {
        failOnDiagnostics = true;
    } else if (args[i] === '--mapping') {
        const name = args[++i];
        if (mappingPath || !name || name.startsWith('--')) throw new Error(usage);
        mappingPath = name;
    } else if (args[i] === '--manifest') {
        const name = args[++i];
        if (manifestPath || !name || name.startsWith('--')) throw new Error(usage);
        manifestPath = name;
    } else if (args[i].startsWith('--')) throw new Error(`Unknown option ${args[i]}. ${usage}`);
    else paths.push(args[i]);
}
if (!paths.length) throw new Error(usage);
if (manifestPath) {
    const physical = async (path: string) => {
        try { return await realpath(resolve(path)); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return resolve(path); throw error; }
    };
    const destination = await physical(manifestPath);
    const inputs = await Promise.all([...paths, ...authorityInputs.map(a => a.name), ...(mappingPath ? [mappingPath] : [])].map(physical));
    const destinationStat = await stat(destination).catch((error: NodeJS.ErrnoException) => { if (error.code === 'ENOENT') return undefined; throw error; });
    const inputStats = await Promise.all(inputs.map(path => stat(path)));
    if (inputs.includes(destination) || (destinationStat && inputStats.some(input => input.dev === destinationStat.dev && input.ino === destinationStat.ino))) throw new Error('Manifest output must not overwrite a canonical source input');
}
const mapping = mappingPath ? MappingProfileSchema.parse(await Bun.file(mappingPath).json()).mapping : undefined;
const sources = await Promise.all(paths.map(async name => ({ name, xml: await Bun.file(name).text() })));
const authorities: AuthoritySource[] = await Promise.all(authorityInputs.map(async input => ({ ...input, xml: await Bun.file(input.name).text() })));
let edition;
if (manifestPath) {
    const result = compileWithManifest(sources, mapping, { authorities });
    await Bun.write(manifestPath, JSON.stringify(result.manifest, null, 2) + '\n');
    edition = result.edition;
} else edition = compile(sources, mapping, { authorities });
process.stdout.write(JSON.stringify(edition, null, 2) + '\n');

if (failOnDiagnostics && edition.diagnostics.length) {
    const counts = new Map<string, number>();
    for (const diagnostic of edition.diagnostics) counts.set(diagnostic.code, (counts.get(diagnostic.code) ?? 0) + 1);
    const summary = [...counts.keys()].sort().map(code => code + '=' + counts.get(code)).join(', ');
    process.stderr.write('Compilation produced ' + edition.diagnostics.length + ' diagnostic(s): ' + summary + '\n');
    process.exitCode = 1;
}
