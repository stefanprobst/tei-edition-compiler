import { EditionSchema } from '@tei-edition/ir';
import { verifyCompilationSources } from './index';

const usage = 'Usage: bun run verify <edition.json> <manifest.json> --source <manifest-name> <local.xml> [...]';

try {
    const [editionPath, manifestPath, ...args] = process.argv.slice(2);
    if (!editionPath || !manifestPath || editionPath.startsWith('--') || manifestPath.startsWith('--')) throw new Error(usage);
    const inputs: { name: string; path: string }[] = [];
    for (let i = 0; i < args.length; i += 3) {
        const [flag, name, path] = args.slice(i, i + 3);
        if (flag !== '--source' || !name || !path || name.startsWith('--') || path.startsWith('--')) throw new Error(usage);
        inputs.push({ name, path });
    }
    if (!inputs.length) throw new Error(usage);
    const edition = EditionSchema.parse(await Bun.file(editionPath).json());
    const manifest: unknown = await Bun.file(manifestPath).json();
    const sources = await Promise.all(inputs.map(async ({ name, path }) => ({ name, xml: await Bun.file(path).text() })));
    const result = verifyCompilationSources(edition, manifest, sources);
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
} catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
}
