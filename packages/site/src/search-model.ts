import type { PartTextRange } from '@acdh-oeaw/tei-edition-ir';
export type SearchIndex = {
    version: '1'; editionSha256: string; basePath: string;
    policy: { deletionText: 'retain'; spacing: 'source' };
    documents: { id: string; title: string; route: string; text: string; runs: { start: number; end: number; source: PartTextRange; href: string }[] }[];
};
export function searchText(index: SearchIndex, query: string, limit = 100) {
    const words = query.trim().split(/\s+/).filter(Boolean);
    if (query.length > 256 || words.join('').length < 2 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) return [];
    const expression = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+');
    const results: { documentId: string; title: string; href: string; start: number; end: number; before: string; match: string; after: string; sourceRanges: PartTextRange[] }[] = [];
    for (const document of index.documents) {
        const regex = new RegExp(expression, 'giu');
        for (let match = regex.exec(document.text); match && results.length < limit; match = regex.exec(document.text)) {
            const start = match.index, end = start + match[0].length;
            const runs = document.runs.filter(run => run.start < end && run.end > start);
            results.push({ documentId: document.id, title: document.title, href: runs[0]?.href ?? document.route, start, end, before: document.text.slice(Math.max(0, start - 60), start), match: match[0], after: document.text.slice(end, end + 90), sourceRanges: runs.map(run => ({ partId: run.source.partId, start: run.source.start + Math.max(start, run.start) - run.start, end: run.source.start + Math.min(end, run.end) - run.start })) });
        }
        if (results.length >= limit) break;
    }
    return results;
}

/** Validate the derived index before a browser uses its text, routes or coordinate mappings. */
export function parseSearchIndex(input: unknown, expectedSha256: string, basePath: string): SearchIndex {
    const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
    const integer = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;
    const invalid = () => { throw new Error('Invalid or mismatched search index'); };
    if (!object(input) || input.version !== '1' || !/^[a-f0-9]{64}$/.test(expectedSha256) || input.editionSha256 !== expectedSha256 || input.basePath !== basePath || !object(input.policy) || input.policy.deletionText !== 'retain' || input.policy.spacing !== 'source' || !Array.isArray(input.documents)) return invalid();
    const ids = new Set<string>(), routes = new Set<string>();
    for (const document of input.documents) {
        if (!object(document) || typeof document.id !== 'string' || ids.has(document.id) || typeof document.title !== 'string' || typeof document.text !== 'string' || typeof document.route !== 'string' || !document.route.startsWith(basePath) || !/^[A-Za-z0-9][A-Za-z0-9._-]*\.html$/.test(document.route.slice(basePath.length)) || routes.has(document.route) || !Array.isArray(document.runs)) return invalid();
        ids.add(document.id); routes.add(document.route);
        let end = 0;
        for (const run of document.runs) {
            if (!object(run) || !integer(run.start) || !integer(run.end) || run.start !== end || run.end <= run.start || run.end > document.text.length || !object(run.source) || typeof run.source.partId !== 'string' || !run.source.partId || !integer(run.source.start) || !integer(run.source.end) || run.source.end - run.source.start !== run.end - run.start || typeof run.href !== 'string' || !run.href.startsWith(document.route + '#record-') || !/^[a-f0-9]{64}$/.test(run.href.slice((document.route + '#record-').length))) return invalid();
            end = run.end;
        }
        if (end !== document.text.length) return invalid();
    }
    return input as SearchIndex;
}
