import { projectDocumentText, type Edition } from '@acdh-oeaw/tei-edition-ir';
import type { SearchIndex } from './search-model';
export { searchText, parseSearchIndex, type SearchIndex } from './search-model';
export function createSearchIndex(edition: Edition, editionSha256: string, basePath: string, routes: ReadonlyMap<string, string>, anchors: ReadonlyMap<string, string>): SearchIndex {
    return { version: '1', editionSha256, basePath, policy: { deletionText: 'retain', spacing: 'source' }, documents: edition.documents.map(document => {
        const projection = projectDocumentText(edition, document.id, { deletionText: 'retain', spacing: 'source' });
        const route = basePath + routes.get(document.id)!;
        return { id: document.id, title: document.metadata.title, route, text: projection.text, runs: projection.runs.map(run => ({ ...run, href: route + '#' + anchors.get(run.source.partId) })) };
    }) };
}
