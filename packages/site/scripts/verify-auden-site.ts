import { createHash } from 'node:crypto';
import { readdir } from 'node:fs/promises';
import { deepStrictEqual, strictEqual, ok } from 'node:assert';
import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';
import { verifyCompilationManifestArtifact } from '@acdh-oeaw/tei-edition-ir/compilation-manifest';
import { parseSearchIndex } from '../src/search-model';
const input = 'packages/site/dist/amp-input', output = process.argv[2] ?? 'packages/site/dist/amp-public';
const edition = EditionSchema.parse(await Bun.file(input + '/edition.json').json());
const manifest = await verifyCompilationManifestArtifact(edition, await Bun.file(input + '/manifest.json').json());
const audit = await Bun.file(input + '/audit.json').json();
const baseline = await Bun.file('corpora/auden-musulin/audit-baseline.json').json();
deepStrictEqual(audit.scope, baseline.scope); deepStrictEqual(audit.verified, baseline.verified);
strictEqual(edition.documents.length, baseline.counts.documents); strictEqual(edition.entities.length, baseline.counts.entities);
strictEqual(edition.mentions.length, baseline.counts.mentions); strictEqual(edition.resources.length, baseline.counts.resources);
deepStrictEqual(edition.diagnostics, baseline.unresolvedResponsibility);
deepStrictEqual(audit.entityNames.missing.map((e: { kind: string; authorityRef: string; otherScopeMatches: string[] }) => ({ kind: e.kind, authorityRef: e.authorityRef, otherScopeMatches: e.otherScopeMatches })), baseline.missingEntityReferences);
deepStrictEqual(audit.identities, baseline.documentIdentityDifferences);
strictEqual(edition.entities.filter(entity => entity.label).length, baseline.counts.suppliedNames);
const authorityNames = new Set(manifest.sources.filter(source => source.role === 'authority').map(source => source.name));
strictEqual(edition.entities.filter(entity => entity.label && authorityNames.has(entity.provenance.source)).length, baseline.counts.registerNames);
strictEqual(edition.entities.filter(entity => entity.label && !authorityNames.has(entity.provenance.source)).length, baseline.counts.documentDefinitionNames);
strictEqual(edition.relations.reduce((total, relation) => total + (relation.externalTargets?.length ?? 0), 0), baseline.counts.externalRelations);
strictEqual(edition.annotations.reduce((total, annotation) => total + (annotation.externalTargets?.length ?? 0), 0), baseline.counts.externalAnnotations);
strictEqual(audit.projections.reduce((total: number, projection: { issues: unknown[] }) => total + projection.issues.length, 0), baseline.counts.sourceSpacingIssues);
strictEqual(audit.projections.reduce((total: number, projection: { characterSpacingIssues: unknown[] }) => total + projection.characterSpacingIssues.length, 0), baseline.counts.characterSpacingIssues);

const names = await readdir(output); strictEqual(names.length, baseline.counts.staticFiles);
const files = new Map(await Promise.all(names.map(async name => [name, await Bun.file(output + '/' + name).text()] as const)));
const config = await Bun.file(input + '/site.json').json();
const base = config.basePath;
let checkedLinks = 0;
for (const [name, html] of files) {
    if (!name.endsWith('.html')) continue;
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]); strictEqual(new Set(ids).size, ids.length, 'Duplicate ID in ' + name);
    for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
        const url = match[1]; if (/^https?:/.test(url)) continue;
        const [path, fragment] = url.split('#'); ok(!path || path.startsWith(base), 'Incorrect base path: ' + url);
        const target = path ? path.slice(base.length) : name; ok(files.has(target), 'Missing target: ' + target);
        if (fragment) ok(files.get(target)!.includes(`id="${fragment}"`), 'Missing fragment: ' + url);
        checkedLinks++;
    }
}
strictEqual(files.get('search.html')!.match(/name="search-index-sha256" content="([a-f0-9]{64})"/)?.[1], createHash('sha256').update(files.get('search-index.json')!).digest('hex'));
const search = parseSearchIndex(JSON.parse(files.get('search-index.json')!), manifest.editionSha256, base);
strictEqual(search.documents.length, 73);
for (const document of search.documents) for (const run of document.runs) {
    const part = edition.documents.flatMap(d => d.parts).find(p => p.id === run.source.partId)!;
    strictEqual(document.text.slice(run.start, run.end), part.content!.text.slice(run.source.start, run.source.end));
}
let imageResponses: number | undefined;
if (await Bun.file(input + '/resource-check.json').exists()) {
    const resources = await Bun.file(input + '/resource-check.json').json();
    strictEqual(resources.editionSha256, manifest.editionSha256, 'Resource check belongs to an older build');
    strictEqual(resources.method, 'HEAD');
    ok(typeof resources.checkedAt === 'string' && Number.isFinite(Date.parse(resources.checkedAt)), 'Invalid resource-check timestamp');
    strictEqual(resources.results.length, edition.resources.length);
    const responses = new Map(resources.results.map((result: { id: string }) => [result.id, result]));
    strictEqual(responses.size, edition.resources.length, 'Duplicate resource-check results');
    for (const resource of edition.resources) {
        const response = responses.get(resource.id) as { sourceUri?: string; previewUri?: string } | undefined;
        ok(response, 'Missing resource-check result: ' + resource.id);
        strictEqual(response.sourceUri, resource.uri, 'Resource-check source differs');
        strictEqual(response.previewUri, config.previews[resource.id], 'Resource-check preview differs');
    }
    imageResponses = resources.results.filter((r: { status: number; contentType: string }) => r.status === 200 && r.contentType?.startsWith('image/')).length;
}
console.log(JSON.stringify({ files: files.size, checkedInternalLinks: checkedLinks, searchDocuments: search.documents.length, sourceVerification: audit.verified, compilerDiagnostics: edition.diagnostics.length, missingNames: audit.entityNames.missing.length, imageResponses, resourceCheckedAt: imageResponses === undefined ? undefined : (await Bun.file(input + '/resource-check.json').json()).checkedAt }));
