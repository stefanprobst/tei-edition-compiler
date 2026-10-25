import type { Edition } from './index';
import { documentEvents } from './reading-order';

export type PartTextRange = Edition['mentions'][number]['range'];
export interface TextRange { start: number; end: number }
export interface TextProjection {
    documentId: string;
    deletionText: 'retain' | 'omit';
    nestedDeletedParts: 'retain' | 'omit';
    spacing: 'source' | 'characters';
    maxSpacingCharacters: number;
    text: string;
    runs: { start: number; end: number; source: PartTextRange; spacingAnnotationId?: string }[];
    anchors: { anchorId: string; partId: string; sourceOffset: number; offset: number }[];
    parts: { partId: string; start: number; end: number }[];
    issues: { code: 'deletion-crosses-part-boundary' | 'unmeasured-spacing' | 'spacing-without-marker' | 'ambiguous-spacing' | 'spacing-expansion-limit'; annotationId: string; partId: string }[];
}

/** A derived text view of validated IR. The source edition is never mutated. */
export function projectDocumentText(edition: Edition, documentId: string, options: { deletionText: 'retain' | 'omit'; nestedDeletedParts?: 'retain' | 'omit'; spacing?: 'source' | 'characters'; maxSpacingCharacters?: number }): TextProjection {
    if (!['retain', 'omit'].includes(options.deletionText)) throw new Error('Unknown deletion-text policy');
    const nestedDeletedParts = options.nestedDeletedParts ?? 'retain';
    if (!['retain', 'omit'].includes(nestedDeletedParts)) throw new Error('Unknown nested-deleted-parts policy');
    if (nestedDeletedParts === 'omit' && options.deletionText !== 'omit') throw new Error('Omitting nested deleted parts requires deletionText omit');
    const spacing = options.spacing ?? 'source';
    const maxSpacingCharacters = options.maxSpacingCharacters ?? 4096;
    if (!['source', 'characters'].includes(spacing)) throw new Error('Unknown spacing policy');
    if (!Number.isSafeInteger(maxSpacingCharacters) || maxSpacingCharacters < 0) throw new Error('Invalid spacing expansion limit');
    const document = edition.documents.find(d => d.id === documentId);
    if (!document) throw new Error(`Unknown document ${documentId}`);
    const result: TextProjection = { documentId, deletionText: options.deletionText, nestedDeletedParts, spacing, maxSpacingCharacters, text: '', runs: [], anchors: [], parts: [], issues: [] };
    const partIds = new Set(document.parts.map(p => p.id));
    const annotations = new Map(edition.annotations.map(a => [a.id, a]));
    const containers = new Map<string, string[]>();
    for (const relation of edition.relations) if (relation.predicate === 'contains-part') for (const id of relation.objectIds) if (partIds.has(id)) {
        const values = containers.get(id) ?? [];
        values.push(relation.subjectId);
        containers.set(id, values);
    }
    const ancestors = (annotationId: string): string[] => {
        const result: string[] = [];
        let current: string | undefined = annotationId;
        while (current) { result.push(current); current = annotations.get(current)?.parentId; }
        return result;
    };
    const containerAncestors = new Map([...containers].map(([id, values]) => [id, new Set(values.flatMap(ancestors))]));
    const omittedParts = new Set<string>();
    if (nestedDeletedParts === 'omit') {
        for (const [id, owners] of containerAncestors) if ([...owners].some(owner => annotations.get(owner)?.kind === 'deletion')) omittedParts.add(id);
        const children = new Map<string, string[]>();
        for (const part of document.parts) if (part.parentId) {
            const values = children.get(part.parentId) ?? [];
            values.push(part.id); children.set(part.parentId, values);
        }
        const queue = [...omittedParts];
        for (let i = 0; i < queue.length; i++) for (const child of children.get(queue[i]) ?? []) if (!omittedParts.has(child)) { omittedParts.add(child); queue.push(child); }
    }
    const exclusions = new Map<string, TextRange[]>();
    if (options.deletionText === 'omit') {
        for (const annotation of edition.annotations) {
            const r = annotation.range;
            if (annotation.kind !== 'deletion' || !r || !partIds.has(r.partId)) continue;
            const values = exclusions.get(r.partId) ?? [];
            if (r.end > r.start) values.push({ start: r.start, end: r.end });
            exclusions.set(r.partId, values);
            for (const child of document.parts) if (child.parentId === r.partId && child.parentOffset! >= r.start && child.parentOffset! <= r.end) {
                const owners = containerAncestors.get(child.id);
                if (owners && !owners.has(annotation.id)) continue;
                if (omittedParts.has(child.id)) continue;
                result.issues.push({ code: 'deletion-crosses-part-boundary', annotationId: annotation.id, partId: child.id });
            }
        }
        for (const [partId, ranges] of exclusions) {
            ranges.sort((a, b) => a.start - b.start || a.end - b.end);
            const merged: TextRange[] = [];
            for (const range of ranges) {
                const previous = merged.at(-1);
                if (previous && range.start <= previous.end) previous.end = Math.max(previous.end, range.end);
                else merged.push({ ...range });
            }
            exclusions.set(partId, merged);
        }
    }
    const spacingByPart = new Map<string, Edition['annotations']>();
    if (spacing === 'characters') {
        const parts = new Map(document.parts.map(p => [p.id, p]));
        for (const annotation of edition.annotations) {
            const r = annotation.range;
            if (annotation.kind !== 'spacing' || !r || !parts.has(r.partId) || omittedParts.has(r.partId)) continue;
            if (r.end - r.start !== 1 || parts.get(r.partId)?.content?.text.slice(r.start, r.end) !== '\uFFFC') {
                result.issues.push({ code: 'spacing-without-marker', annotationId: annotation.id, partId: r.partId });
                continue;
            }
            const values = spacingByPart.get(r.partId) ?? [];
            values.push(annotation);
            spacingByPart.set(r.partId, values);
        }
        for (const values of spacingByPart.values()) values.sort((a, b) => a.range!.start - b.range!.start);
    }
    const anchors = new Map(edition.anchors.map(a => [a.id, a]));
    const openParts = new Map<string, TextProjection['parts'][number]>();
    const nextExclusion = new Map<string, number>();
    const chunks: string[] = [];
    let offset = 0;
    for (const event of documentEvents(edition, documentId)) {
        if (event.kind === 'enter-part') {
            const span = { partId: event.partId, start: offset, end: offset };
            openParts.set(event.partId, span);
            result.parts.push(span);
        } else if (event.kind === 'exit-part') {
            openParts.get(event.partId)!.end = offset;
            openParts.delete(event.partId);
        } else if (event.kind === 'anchor') {
            result.anchors.push({ anchorId: event.anchorId, partId: event.partId, sourceOffset: anchors.get(event.anchorId)!.offset, offset });
        } else {
            if (omittedParts.has(event.partId)) continue;
            const copy = (start: number, end: number) => {
                if (end <= start) return;
                chunks.push(event.text.slice(start - event.start, end - event.start));
                result.runs.push({ start: offset, end: offset + end - start, source: { partId: event.partId, start, end } });
                offset += end - start;
            };
            const append = (start: number, end: number) => {
                if (end <= start) return;
                let cursor = start;
                const values = (spacingByPart.get(event.partId) ?? []).filter(a => a.range!.start >= start && a.range!.end <= end);
                for (let i = 0; i < values.length; i++) {
                    const annotation = values[i], r = annotation.range!;
                    copy(cursor, r.start);
                    let last = i;
                    while (last + 1 < values.length && values[last + 1].range!.start === r.start) last++;
                    const raw = annotation.details.characterCount;
                    const count = raw !== undefined && /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;
                    const code = last !== i ? 'ambiguous-spacing' : count === undefined ? 'unmeasured-spacing' : count > maxSpacingCharacters ? 'spacing-expansion-limit' : undefined;
                    if (code) {
                        result.issues.push({ code, annotationId: annotation.id, partId: event.partId });
                        copy(r.start, r.end);
                    } else if (count! > 0) {
                        chunks.push(' '.repeat(count!));
                        result.runs.push({ start: offset, end: offset + count!, source: { ...r }, spacingAnnotationId: annotation.id });
                        offset += count!;
                    }
                    cursor = r.end;
                    i = last;
                }
                copy(cursor, end);
            };
            const ranges = exclusions.get(event.partId) ?? [];
            let i = nextExclusion.get(event.partId) ?? 0;
            while (i < ranges.length && ranges[i].end <= event.start) i++;
            let cursor = event.start;
            while (i < ranges.length && ranges[i].start < event.end) {
                append(cursor, Math.min(ranges[i].start, event.end));
                cursor = Math.max(cursor, ranges[i].end);
                if (ranges[i].end > event.end) break;
                i++;
            }
            append(cursor, event.end);
            nextExclusion.set(event.partId, i);
        }
    }
    result.text = chunks.join('');
    return result;
}

const validateRange = (range: TextRange) => {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start) throw new Error('Invalid text range');
};

/** Nonempty visible intersections only; a removed range maps to no projected ranges. */
export function projectSourceRange(projection: TextProjection, source: PartTextRange): TextRange[] {
    validateRange(source);
    const result: TextRange[] = [];
    for (const run of projection.runs) if (run.source.partId === source.partId) {
        const start = Math.max(source.start, run.source.start), end = Math.min(source.end, run.source.end);
        if (end > start) result.push(run.spacingAnnotationId ? { start: run.start, end: run.end } : { start: run.start + start - run.source.start, end: run.start + end - run.source.start });
    }
    return result;
}

/** Map search/highlight offsets back to original part ranges, retaining discontinuities. */
export function sourceRangesForText(projection: TextProjection, range: TextRange): PartTextRange[] {
    validateRange(range);
    if (range.end > projection.text.length) throw new Error('Range exceeds projected text');
    const result: PartTextRange[] = [];
    for (const run of projection.runs) {
        const start = Math.max(range.start, run.start), end = Math.min(range.end, run.end);
        if (end > start) result.push(run.spacingAnnotationId ? { ...run.source } : { partId: run.source.partId, start: run.source.start + start - run.start, end: run.source.start + end - run.start });
    }
    return result;
}
