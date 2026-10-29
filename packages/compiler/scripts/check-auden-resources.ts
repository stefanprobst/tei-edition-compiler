import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';
import { verifyCompilationManifestArtifact } from '@acdh-oeaw/tei-edition-ir/compilation-manifest';
import { demoPreviewUri } from '../../../corpora/auden-musulin/preview';
const directory = 'packages/site/dist/amp-input';
const edition = EditionSchema.parse(await Bun.file(directory + '/edition.json').json());
const manifest = await verifyCompilationManifestArtifact(edition, await Bun.file(directory + '/manifest.json').json());
const resources = edition.resources.map(resource => ({ id: resource.id, sourceUri: resource.uri, previewUri: demoPreviewUri(resource.uri) }));
const results: { id: string; sourceUri: string; previewUri?: string; status?: number; contentType?: string; error?: string }[] = [];
let cursor = 0;
await Promise.all(Array.from({ length: 4 }, async () => {
    while (cursor < resources.length) {
        const resource = resources[cursor++];
        if (!resource.previewUri) { results.push({ ...resource, error: 'No explicit preview mapping' }); continue; }
        try {
            const response = await fetch(resource.previewUri, { method: 'HEAD', signal: AbortSignal.timeout(15000) });
            results.push({ ...resource, status: response.status, contentType: response.headers.get('content-type') ?? undefined });
        } catch (error) { results.push({ ...resource, error: error instanceof Error ? error.message : String(error) }); }
    }
}));
results.sort((a,b) => a.id.localeCompare(b.id));
const checkedAt = new Date().toISOString();
await Bun.write(directory + '/resource-check.json', JSON.stringify({ editionSha256: manifest.editionSha256, checkedAt, method: 'HEAD', results }, null, 2));
console.log(JSON.stringify({ checkedAt, checked: results.length, imageResponses: results.filter(r => r.status === 200 && r.contentType?.startsWith('image/')).length, other: results.filter(r => r.status !== 200 || !r.contentType?.startsWith('image/')) }));
