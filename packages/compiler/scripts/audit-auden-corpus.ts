import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { compileWithManifest, createSourceIndex, verifyCompilationSources, audenMusulinMapping, type Source, type AuthoritySource } from '../src';
import { projectDocumentText, summarizeEdition } from '@acdh-oeaw/tei-edition-ir';
import { demoPreviewUri } from '../../../corpora/auden-musulin/preview';
const lock = await Bun.file('corpora/auden-musulin/manifest.json').json();
const sources: Source[] = [], authorities: AuthoritySource[] = [];
for (const [group, role] of [[lock, 'document'], [lock.authorities, 'authority']] as const) {
    for (const [name, info] of Object.entries(group.files) as [string, {sha256: string; gitBlob: string; bytes: number; uri?: string}][]) {
        const bytes = await Bun.file('packages/site/dist/amp-sources/' + name).bytes();
        if (bytes.length !== info.bytes || createHash('sha256').update(bytes).digest('hex') !== info.sha256 || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== info.gitBlob) throw new Error('Pinned input differs: ' + name);
        const xml = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
        if (createHash('sha256').update(xml).digest('hex') !== info.sha256) throw new Error('UTF-8 source round-trip differs: ' + name);
        if (role === 'document') sources.push({ name, uri: info.uri!, xml });
        else authorities.push({ name, uri: info.uri!, xml });
    }
}
const bundle = compileWithManifest(sources, audenMusulinMapping, { authorities });
const verified = verifyCompilationSources(bundle.edition, bundle.manifest, [...sources, ...authorities]);
const edition = bundle.edition;
const projections = edition.documents.map(document => {
    const projection = projectDocumentText(edition, document.id, { deletionText: 'retain', spacing: 'source' });
    const expanded = projectDocumentText(edition, document.id, { deletionText: 'retain', spacing: 'characters' });
    return { documentId: document.id, characters: projection.text.length, issues: projection.issues, characterSpacingIssues: expanded.issues };
});
const externalRelations = edition.relations.flatMap(relation => (relation.externalTargets ?? []).map(target => ({ relationId: relation.id, predicate: relation.predicate, ...target, provenance: relation.provenance })));
const externalAnnotations = edition.annotations.flatMap(annotation => (annotation.externalTargets ?? []).map(target => ({ annotationId: annotation.id, ...target, provenance: annotation.provenance })));
const authorityIndexes = authorities.map(source => ({ source, index: createSourceIndex(source) }));
const report = {
    scope: { documents: sources.length, authorities: authorities.length, documentRepository: lock.repository, documentCommit: lock.commit, authorityRepository: lock.authorities.repository, authorityCommit: lock.authorities.commit },
    verified, summary: summarizeEdition(edition),
    diagnostics: edition.diagnostics,
    entityNames: { fromRegisters: edition.entities.filter(e => e.label && authorities.some(a => a.name === e.provenance.source)).length, fromDocumentDefinitions: edition.entities.filter(e => e.label && sources.some(s => s.name === e.provenance.source)).length, supplied: edition.entities.filter(e => e.label).length, missing: edition.entities.filter(e => !e.label).map(e => ({ id: e.id, kind: e.kind, authorityRef: e.authorityRef, provenance: e.provenance, otherScopeMatches: authorityIndexes.filter(({source, index}) => source.uri !== e.authorityRef.split('#')[0] && !!index.resolve({ source: source.name, selector: 'id(' + JSON.stringify(decodeURIComponent(new URL(e.authorityRef).hash.slice(1))) + ')' })).map(({source}) => source.uri + new URL(e.authorityRef).hash) })) },
    links: { externalRelations, externalAnnotations },
    resources: { total: edition.resources.length, uniqueUris: new Set(edition.resources.map(r => r.uri)).size, previewsMapped: edition.resources.filter(r => demoPreviewUri(r.uri)).length, unmapped: edition.resources.filter(r => !demoPreviewUri(r.uri)) },
    identities: edition.documents.filter(d => d.id !== d.provenance.source).map(d => ({ declaredId: d.id, canonicalSource: d.provenance.source, uri: lock.files[d.provenance.source].uri })),
    projections,
};
const output = 'packages/site/dist/amp-input';
await mkdir(output, { recursive: true });
await Bun.write(output + '/edition.json', JSON.stringify(edition));
await Bun.write(output + '/manifest.json', JSON.stringify(bundle.manifest));
await Bun.write(output + '/audit.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify({ scope: report.scope, verified, diagnostics: edition.diagnostics.length, names: report.entityNames.supplied, missingNames: report.entityNames.missing.length, externalRelations: externalRelations.length, externalAnnotations: externalAnnotations.length, resources: report.resources.total, unmappedPreviews: report.resources.unmapped.length, projectionIssues: projections.reduce((n, d) => n + d.issues.length, 0), characterSpacingIssues: projections.reduce((n, d) => n + d.characterSpacingIssues.length, 0) }));

await Bun.write(output + '/site.json', JSON.stringify({ title: 'Auden–Musulin Papers · complete pinned-edition pilot', attribution: 'Auden–Musulin Papers, Austrian Academy of Sciences. XML: CC BY 4.0; literary and image rights remain separate. Complete 73-document inventory at document commit ' + lock.commit + '; separately pinned authority revision ' + lock.authorities.commit + '. Source data issues and editorial uncertainty remain explicit.', basePath: '/amp/', sourceLinks: Object.fromEntries([...sources.map(s => [s.name, `${lock.repository}/blob/${lock.commit}/${lock.files[s.name].path}`]), ...authorities.map(s => [s.name, `${lock.authorities.repository}/blob/${lock.authorities.commit}/${lock.authorities.files[s.name].path}`])]), documentRoutes: Object.fromEntries(edition.documents.map(d => [d.id, d.provenance.source.replace(/\.xml$/, '.html')])), previews: Object.fromEntries(edition.resources.flatMap(r => { const uri = demoPreviewUri(r.uri); return uri ? [[r.id, uri]] : []; })), search: true, about: { title: 'About this publication pilot', paragraphs: ['This pilot presents all 73 edition documents at the recorded source revision. The five authority registers are pinned separately; this is a reproducible historical inventory rather than a current release claim.', 'Reading policy: source order, deleted text retained, and explicit source-spacing markers. Scholarly commentary, responsibility and certainty remain source-backed. Unmeasured extents remain visible instead of being converted into guessed spaces.', 'The audit retains one unresolved responsibility token and six entity references without a matching name in the supplied registers. One declared document ID differs from its canonical filename; explicit source URIs preserve links and filename-based routes without changing the XML.', 'XML licensing and literary/image rights follow the original source statements. Canonical sources are linked at the exact document and authority revisions used here. This website is a derived publication artifact; the original TEI remains canonical.'] } }, null, 2));
