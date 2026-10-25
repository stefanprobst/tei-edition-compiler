import type { AlternativesStudy } from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';
import { partLanguageRuns, documentEvents, type Edition } from '@acdh-oeaw/tei-edition-ir';

export type TextSegment = { start: number; end: number; text: string; annotationIds: string[]; mentionIds: string[]; language?: string };

/** Partition direct part text at semantic boundaries; all offsets remain UTF-16 IR offsets. */
export function textSegments(edition: Edition, partId: string, start: number, end: number): TextSegment[] {
    const part = edition.documents.flatMap(document => document.parts).find(part => part.id === partId);
    if (!part || start < 0 || end < start || end > (part.content?.text.length ?? 0)) throw new Error('Invalid part text range');
    const annotations = edition.annotations.filter(annotation => annotation.range?.partId === partId && annotation.range.start < end && annotation.range.end > start);
    const mentions = edition.mentions.filter(mention => mention.range.partId === partId && mention.range.start < end && mention.range.end > start);
    const languages = partLanguageRuns(edition, partId);
    const boundaries = new Set([start, end]);
    for (const range of [...annotations.map(a => a.range!), ...mentions.map(m => m.range), ...languages]) {
        if (range.start > start && range.start < end) boundaries.add(range.start);
        if (range.end > start && range.end < end) boundaries.add(range.end);
    }
    const points = [...boundaries].sort((a, b) => a - b);
    return points.slice(0, -1).map((start, index) => {
        const end = points[index + 1];
        return {
            start, end, text: part.content!.text.slice(start, end),
            annotationIds: annotations.filter(a => a.range!.start <= start && a.range!.end >= end).map(a => a.id),
            mentionIds: mentions.filter(m => m.range.start <= start && m.range.end >= end).map(m => m.id),
            language: languages.find(run => run.start <= start && run.end >= end)?.language,
        };
    });
}

/** Only browser-safe remote links are made active, even for uploaded validated IR. */
export function remoteUrl(value: string): string | undefined {
    try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : undefined; }
    catch { return undefined; }
}

/** Distinguish occurrences without inferring titles, works or physical components. */
export function partLabels(parts: Edition['documents'][number]['parts']): Map<string, string> {
    const totals = new Map<string, number>(), seen = new Map<string, number>();
    for (const part of parts) totals.set(part.kind, (totals.get(part.kind) ?? 0) + 1);
    return new Map([...parts].sort((a, b) => a.order - b.order).map(part => {
        const occurrence = (seen.get(part.kind) ?? 0) + 1;
        seen.set(part.kind, occurrence);
        const kind = part.kind.replace(/[-_:]/g, ' ');
        return [part.id, totals.get(part.kind)! > 1 ? `${kind} ${occurrence} of ${totals.get(part.kind)}` : kind];
    }));
}


/** Place reading groups by semantic text events, independent of storage-array ordering. */
export function alternativeGroupsForDocument(edition: Edition, study: AlternativesStudy, documentId: string) {
    const markers = new Map(edition.annotations.map(annotation => [annotation.id, annotation]));
    const groups = study.groups.map(group => ({ group, range: markers.get(group.markerId)?.range }));
    return [...documentEvents(edition, documentId)].filter(event => event.kind === 'text').flatMap(event =>
        groups.filter(entry => entry.range?.partId === event.partId && entry.range.start >= event.start && entry.range.end <= event.end)
            .sort((a, b) => a.range!.start - b.range!.start).map(entry => entry.group));
}
