import { EditionSchema, canonicalJson, projectDocumentText, projectSourceRange, type Edition, type PartTextRange, type TextProjection, type TextRange } from '../index';
import { AlternativesStudySchema, assertAlternativeAnchors, projectAlternative, type AlternativeProjection, type AlternativesStudy } from './alternatives';

export type SelectedSourceRange =
    | ({ kind: 'part' } & PartTextRange)
    | { kind: 'candidate'; groupId: string; candidateId: string; markerId: string; start: number; end: number };
export type DocumentAlternativeChoice = {
    groupId: string; candidateId: string; markerId: string; source: PartTextRange;
} & ({ status: 'applied'; range: TextRange } | { status: 'excluded' });
export type DocumentAlternativesProjection = {
    documentId: string; text: string;
    policies: { deletionText: 'retain' | 'omit'; candidateDeletionText: 'retain' | 'omit'; nestedDeletedParts: 'retain' | 'omit'; spacing: 'source' | 'characters'; maxSpacingCharacters: number };
    runs: { start: number; end: number; source: SelectedSourceRange; spacingAnnotationId?: string }[];
    anchors: TextProjection['anchors']; parts: TextProjection['parts']; choices: DocumentAlternativeChoice[];
    issues: (TextProjection['issues'][number]
        | { code: 'unselected-alternative' | 'unsupported-alternative'; markerId: string; partId: string }
        | { code: 'missing-text'; annotationId: string; groupId: string; candidateId: string; markerId: string })[];
};
type Options = Parameters<typeof projectDocumentText>[2] & { candidateDeletionText: 'retain' | 'omit' };

/** Compose explicit choices into a snapshot of validated IR; source artifacts are never mutated. */
export async function projectDocumentAlternatives(
    editionInput: Edition, studyInput: AlternativesStudy, documentId: string,
    selections: readonly { groupId: string; candidateId: string }[], options: Options,
): Promise<DocumentAlternativesProjection> {
    // Snapshot before yielding so callers cannot change the object after its fingerprint was checked.
    const edition = EditionSchema.parse(editionInput), study = AlternativesStudySchema.parse(studyInput);
    const selected = selections.map(selection => ({ ...selection })), policies = { ...options };
    if (!['retain', 'omit'].includes(policies.candidateDeletionText)) throw new Error('Unknown candidate deletion policy');
    if (!globalThis.crypto?.subtle) throw new Error('Artifact verification requires Web Crypto');
    const bytes = new TextEncoder().encode(canonicalJson(edition));
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
    if (hash !== study.editionSha256) throw new Error('Alternatives study does not match the edition artifact');
    assertAlternativeAnchors(edition, study);
    const base = projectDocumentText(edition, documentId, policies);
    const document = edition.documents.find(document => document.id === documentId)!;
    const partIds = new Set(document.parts.map(part => part.id));
    const markers = new Map(edition.annotations.filter(annotation => annotation.kind === 'uncompiled-content').map(annotation => [annotation.id, annotation]));
    const groups = new Map(study.groups.map(group => [group.id, group]));
    const localGroups = new Map(study.groups.filter(group => partIds.has(markers.get(group.markerId)!.range!.partId)).map(group => [group.markerId, group]));
    const choices = new Map<string, DocumentAlternativeChoice>();
    const edits: { start: number; end: number; projection: AlternativeProjection; choice: Omit<DocumentAlternativeChoice, 'status' | 'range'> }[] = [];
    const locations = new Set<string>();
    for (const marker of markers.values()) {
        const range = marker.range!;
        const location = JSON.stringify([range.partId, range.start, range.end]);
        if (locations.has(location)) throw new Error('Overlapping alternative markers');
        locations.add(location);
    }
    for (const selection of selected) {
        if (choices.has(selection.groupId)) throw new Error('Duplicate alternative group selection');
        const group = groups.get(selection.groupId);
        if (!group) throw new Error('Unknown alternative group');
        const marker = markers.get(group.markerId)!;
        if (!partIds.has(marker.range!.partId)) throw new Error('Selected group belongs to another document');
        const projection = projectAlternative(study, group.id, selection.candidateId, { deletionText: policies.candidateDeletionText });
        const choice = { groupId: group.id, candidateId: selection.candidateId, markerId: marker.id, source: { ...marker.range! } };
        choices.set(group.id, { ...choice, status: 'excluded' });
        const ranges = projectSourceRange(base, marker.range!);
        if (!ranges.length) continue; // Base policy wins: never resurrect a deleted marker or subtree.
        if (ranges.length !== 1 || ranges[0].end - ranges[0].start !== 1 || base.runs.some(run => run.spacingAnnotationId && run.start < ranges[0].end && run.end > ranges[0].start)) throw new Error('Alternative marker was transformed by another policy');
        edits.push({ ...ranges[0], projection, choice });
    }
    edits.sort((a, b) => a.start - b.start);
    for (let index = 1; index < edits.length; index++) if (edits[index].start < edits[index - 1].end) throw new Error('Overlapping alternative replacements');
    const result: DocumentAlternativesProjection = {
        documentId, text: '', policies: { deletionText: base.deletionText, candidateDeletionText: policies.candidateDeletionText, nestedDeletedParts: base.nestedDeletedParts, spacing: base.spacing, maxSpacingCharacters: base.maxSpacingCharacters },
        runs: [], anchors: [], parts: [], choices: [], issues: [...base.issues],
    };
    const chunks: string[] = []; let offset = 0;
    const copy = (start: number, end: number) => {
        if (end <= start) return;
        chunks.push(base.text.slice(start, end));
        for (const run of base.runs) {
            const from = Math.max(start, run.start), to = Math.min(end, run.end);
            if (to <= from) continue;
            const source: SelectedSourceRange = run.spacingAnnotationId ? { kind: 'part', ...run.source } : { kind: 'part', partId: run.source.partId, start: run.source.start + from - run.start, end: run.source.start + to - run.start };
            result.runs.push({ start: offset + from - start, end: offset + to - start, source, ...(run.spacingAnnotationId ? { spacingAnnotationId: run.spacingAnnotationId } : {}) });
        }
        offset += end - start;
    };
    let cursor = 0;
    for (const edit of edits) {
        copy(cursor, edit.start);
        const start = offset, projection = edit.projection;
        chunks.push(projection.text);
        for (const run of projection.runs) result.runs.push({ start: offset + run.start, end: offset + run.end, source: { kind: 'candidate', groupId: projection.groupId, candidateId: projection.candidateId, markerId: projection.markerId, start: run.source.start, end: run.source.end } });
        offset += projection.text.length;
        choices.set(projection.groupId, { ...edit.choice, status: 'applied', range: { start, end: offset } });
        for (const issue of projection.issues) result.issues.push({ ...issue, groupId: projection.groupId, candidateId: projection.candidateId, markerId: projection.markerId });
        cursor = edit.end;
    }
    copy(cursor, base.text.length);
    result.text = chunks.join('');
    const position = (value: number) => {
        let delta = 0;
        for (const edit of edits) {
            if (value <= edit.start) break;
            if (value < edit.end) throw new Error('Structural boundary falls inside an alternative marker');
            delta += edit.projection.text.length - (edit.end - edit.start);
        }
        return value + delta;
    };
    result.anchors = base.anchors.map(anchor => ({ ...anchor, offset: position(anchor.offset) }));
    result.parts = base.parts.map(part => ({ ...part, start: position(part.start), end: position(part.end) }));
    result.choices = selected.map(selection => choices.get(selection.groupId)!);
    for (const marker of markers.values()) {
        if (!partIds.has(marker.range!.partId) || !projectSourceRange(base, marker.range!).length) continue;
        const group = localGroups.get(marker.id);
        if (group && choices.has(group.id)) continue;
        result.issues.push({ code: group ? 'unselected-alternative' : 'unsupported-alternative', markerId: marker.id, partId: marker.range!.partId });
    }
    return result;
}

function checkRange(range: TextRange, length?: number) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start || (length !== undefined && range.end > length)) throw new Error('Invalid selected text range');
}
/** Map selected document offsets to either original part text or candidate-local text. */
export function selectedSourceRangesForText(projection: DocumentAlternativesProjection, range: TextRange): SelectedSourceRange[] {
    checkRange(range, projection.text.length);
    return projection.runs.flatMap(run => {
        const start = Math.max(range.start, run.start), end = Math.min(range.end, run.end);
        return end > start ? [run.spacingAnnotationId ? { ...run.source } : { ...run.source, start: run.source.start + start - run.start, end: run.source.start + end - run.start }] : [];
    });
}
/** A replaced base marker has no character mapping; its non-affine span is recorded in choices. */
export function projectSelectedSourceRange(projection: DocumentAlternativesProjection, source: SelectedSourceRange): TextRange[] {
    checkRange(source);
    return projection.runs.flatMap(run => {
        if (run.source.kind !== source.kind) return [];
        if (source.kind === 'part' && (run.source as Extract<SelectedSourceRange, { kind: 'part' }>).partId !== source.partId) return [];
        if (source.kind === 'candidate') {
            const candidate = run.source as Extract<SelectedSourceRange, { kind: 'candidate' }>;
            if (candidate.groupId !== source.groupId || candidate.candidateId !== source.candidateId || candidate.markerId !== source.markerId) return [];
        }
        const start = Math.max(source.start, run.source.start), end = Math.min(source.end, run.source.end);
        return end > start ? [run.spacingAnnotationId ? { start: run.start, end: run.end } : { start: run.start + start - run.source.start, end: run.start + end - run.source.start }] : [];
    });
}
