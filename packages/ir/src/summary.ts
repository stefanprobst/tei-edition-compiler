import type { Edition } from './index';

const tally = (values: string[]): Map<string, number> => {
    const result = new Map<string, number>();
    for (const value of values) result.set(value, (result.get(value) ?? 0) + 1);
    return result;
};
const counts = (values: string[]): Record<string, number> => Object.fromEntries([...tally(values)].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
const diagnosticCounts = (values: Edition['diagnostics']) => ({ total: values.length, byCode: counts(values.map(d => d.code)) });

/** Review validated IR without loading source files or interpreting selectors. */
export function summarizeEdition(edition: Edition) {
    const mentions = tally(edition.mentions.map(m => m.range.partId));
    const anchors = tally(edition.anchors.map(a => a.partId));
    const bySource = new Map<string, Edition['diagnostics']>();
    for (const diagnostic of edition.diagnostics) {
        const values = bySource.get(diagnostic.provenance.source) ?? [];
        values.push(diagnostic); bySource.set(diagnostic.provenance.source, values);
    }
    const documents = edition.documents.map(document => ({
        id: document.id,
        title: document.metadata.title,
        source: document.provenance.source,
        languageInventory: [...new Set(document.metadata.languages)].sort(),
        parts: {
            total: document.parts.length,
            byKind: counts(document.parts.map(p => p.kind)),
            withText: document.parts.filter(p => (p.content?.text.length ?? 0) > 0).length,
            textLength: document.parts.reduce((sum, p) => sum + (p.content?.text.length ?? 0), 0),
        },
        mentions: document.parts.reduce((sum, p) => sum + (mentions.get(p.id) ?? 0), 0),
        anchors: document.parts.reduce((sum, p) => sum + (anchors.get(p.id) ?? 0), 0),
        resources: new Set(document.resourceIds).size,
        ownedRelations: new Set(document.relationIds).size,
        ownedAnnotations: new Set(document.annotationIds).size,
        sourceDiagnostics: diagnosticCounts(bySource.get(document.provenance.source) ?? []),
    }));
    const documentIds = new Set(edition.documents.map(d => d.id));
    return {
        irVersion: edition.version,
        totals: {
            documents: edition.documents.length,
            parts: documents.reduce((sum, d) => sum + d.parts.total, 0),
            textLength: documents.reduce((sum, d) => sum + d.parts.textLength, 0),
            entities: edition.entities.length,
            mentions: edition.mentions.length,
            relations: edition.relations.length,
            annotations: edition.annotations.length,
            resources: edition.resources.length,
            anchors: edition.anchors.length,
        },
        entities: {
            withLabels: edition.entities.filter(e => !!e.label?.trim()).length,
            byKind: counts(edition.entities.map(e => e.kind)),
        },
        relations: {
            byPredicate: counts(edition.relations.map(r => r.predicate)),
            internalDocumentTargets: edition.relations.reduce((sum, r) => sum + r.objectIds.filter(id => documentIds.has(id)).length, 0),
            externalDocumentTargets: edition.relations.reduce((sum, r) => sum + (r.externalTargets?.length ?? 0), 0),
        },
        annotations: {
            byKind: counts(edition.annotations.map(a => a.kind)),
            externalAnnotationTargets: edition.annotations.reduce((sum, a) => sum + (a.externalTargets?.length ?? 0), 0),
        },
        diagnostics: diagnosticCounts(edition.diagnostics),
        documents,
    };
}
export type EditionSummary = ReturnType<typeof summarizeEdition>;
