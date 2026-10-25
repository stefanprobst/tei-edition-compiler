import { EditionSchema, summarizeEdition } from './index';

const paths = process.argv.slice(2);
if (paths.length !== 1 || paths[0].startsWith('--')) throw new Error('Usage: bun run inspect <edition.json>');
const edition = EditionSchema.parse(await Bun.file(paths[0]).json());
process.stdout.write(JSON.stringify(summarizeEdition(edition), null, 2) + '\n');
