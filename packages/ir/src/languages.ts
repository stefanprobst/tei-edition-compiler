import type { Edition } from './index';

export interface LanguageRun {
    start: number;
    end: number;
    language?: string;
    annotationIds: string[];
    conflicted: boolean;
}

/** Resolve explicit semantic declarations in validated IR; no tag inference or XML lookup. */
export function partLanguageRuns(edition: Edition, partId: string): LanguageRun[] {
    const part = edition.documents.flatMap(d => d.parts).find(p => p.id === partId);
    if (!part) throw new Error(`Unknown part ${partId}`);
    const length = part.content?.text.length ?? 0;
    if (!length) return [];
    const declarations = edition.annotations.filter(a => a.kind === 'language' && a.range?.partId === partId && a.details.language !== undefined && a.range.end > a.range.start).map(a => ({
        id: a.id, start: a.range!.start, end: a.range!.end, language: a.details.language,
        depth: /^\d+$/.test(a.details.depth ?? '') && Number.isSafeInteger(Number(a.details.depth)) ? Number(a.details.depth) : a.details.scope === 'part' ? 0 : 1,
    }));
    const boundaries = [...new Set([0, length, ...declarations.flatMap(d => [d.start, d.end])])].sort((a, b) => a - b);
    const result: LanguageRun[] = [];
    for (let i = 1; i < boundaries.length; i++) {
        const start = boundaries[i - 1], end = boundaries[i];
        let active = declarations.filter(d => d.start <= start && d.end >= end);
        if (active.length) {
            const depth = Math.max(...active.map(d => d.depth));
            active = active.filter(d => d.depth === depth);
            const width = Math.min(...active.map(d => d.end - d.start));
            active = active.filter(d => d.end - d.start === width);
        }
        const values = [...new Set(active.map(d => d.language.toLowerCase()))];
        const spelling = active.map(d => d.language).sort()[0];
        const run: LanguageRun = { start, end, ...(values.length === 1 && spelling ? { language: spelling } : {}), annotationIds: active.map(d => d.id).sort(), conflicted: values.length > 1 };
        const previous = result.at(-1);
        if (previous && previous.end === start && previous.language === run.language && previous.conflicted === run.conflicted && JSON.stringify(previous.annotationIds) === JSON.stringify(run.annotationIds)) previous.end = end;
        else result.push(run);
    }
    return result;
}
