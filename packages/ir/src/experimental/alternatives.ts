import { z } from 'zod';
import { ProvenanceSchema, AnnotatedTextSchema, LocalAnnotationSchema, textEvidenceFields, type Edition } from '../index';

const evidence = textEvidenceFields;
const record = { id: z.string().min(1), provenance: ProvenanceSchema };
export { LocalAnnotationSchema };
export const AlternativeContentSchema = AnnotatedTextSchema;
export const WitnessSchema = z.object({ ...record, kind: z.enum(['manuscript', 'edition', 'unspecified']), label: z.string().min(1).optional() }).strict();
export const CandidateSchema = z.object({
    ...record, role: z.enum(['editorial-base', 'variant', 'abbreviated-form', 'expanded-form']),
    content: AlternativeContentSchema,
    witnessIds: z.array(z.string()), ...evidence,
}).strict();
export const AlternativeGroupSchema = z.object({
    ...record, kind: z.enum(['textual-variation', 'abbreviation-expansion']), markerId: z.string().min(1), candidates: z.array(CandidateSchema).min(2),
    notes: z.array(z.object({ ...record, content: AlternativeContentSchema, ...evidence }).strict()), ...evidence,
}).strict();
export const AlternativesStudySchema = z.object({
    version: z.literal('0.3'), editionSha256: z.string().regex(/^[a-f0-9]{64}$/),
    witnesses: z.array(WitnessSchema), groups: z.array(AlternativeGroupSchema),
    diagnostics: z.array(z.object({ markerId: z.string(), code: z.string().min(1), message: z.string(), provenance: ProvenanceSchema }).strict()),
}).strict().superRefine((study, context) => {
    const ids = new Set<string>(), markers = new Set<string>();
    const issue = (message: string) => context.addIssue({ code: 'custom', message });
    for (const record of [...study.witnesses, ...study.groups, ...study.groups.flatMap(group => [...group.candidates, ...group.notes, ...[...group.candidates, ...group.notes].flatMap(owner => owner.content.annotations)])]) {
        if (ids.has(record.id)) issue('Duplicate study ID ' + record.id);
        ids.add(record.id);
    }
    const witnessIds = new Set(study.witnesses.map(witness => witness.id));
    for (const group of study.groups) {
        if (markers.has(group.markerId)) issue('Duplicate group marker');
        markers.add(group.markerId);
        if (group.candidates.filter(candidate => candidate.role === 'editorial-base').length > 1) issue('More than one editorial base');
        if (group.kind === 'abbreviation-expansion') {
            if (group.candidates.length !== 2 || group.candidates.filter(c => c.role === 'abbreviated-form').length !== 1 || group.candidates.filter(c => c.role === 'expanded-form').length !== 1 || group.notes.length || group.candidates.some(c => c.witnessIds.length)) issue('Abbreviation/expansion groups require one neutral form of each kind and no apparatus evidence');
        } else if (group.candidates.some(c => !['editorial-base', 'variant'].includes(c.role))) issue('Textual variation requires manuscript/edition candidate roles');
        for (const candidate of group.candidates) {
            if (new Set(candidate.witnessIds).size !== candidate.witnessIds.length) issue('Duplicate candidate witness');
            for (const id of candidate.witnessIds) if (!witnessIds.has(id)) issue('Unresolved witness ' + id);
        }
    }
    for (const diagnostic of study.diagnostics) {
        if (markers.has(diagnostic.markerId)) issue('Marker is both compiled and unsupported, or has repeated diagnostics');
        markers.add(diagnostic.markerId);
    }
});
export type AlternativesStudy = z.infer<typeof AlternativesStudySchema>;

/** Explicit candidate selection only: no default base, witness preference or chronological inference. */
export function selectAlternative(study: AlternativesStudy, groupId: string, candidateId: string) {
    const group = study.groups.find(group => group.id === groupId);
    if (!group) throw new Error('Unknown alternative group ' + groupId);
    const candidate = group.candidates.find(candidate => candidate.id === candidateId);
    if (!candidate) throw new Error('Candidate does not belong to the alternative group');
    return structuredClone(candidate);
}


export type AlternativeProjection = {
    groupId: string; candidateId: string; markerId: string; sourceLength: number; deletionText: 'retain' | 'omit'; text: string;
    runs: { start: number; end: number; source: { candidateId: string; start: number; end: number } }[];
    issues: { code: 'missing-text'; annotationId: string }[];
};

/** Project one explicitly chosen candidate. The base marker and edition remain untouched. */
export function projectAlternative(study: AlternativesStudy, groupId: string, candidateId: string, options: { deletionText: 'retain' | 'omit' }): AlternativeProjection {
    if (!['retain', 'omit'].includes(options.deletionText)) throw new Error('Unknown candidate deletion policy');
    const candidate = selectAlternative(study, groupId, candidateId);
    const group = study.groups.find(group => group.id === groupId)!;
    const result: AlternativeProjection = { groupId, candidateId, markerId: group.markerId, sourceLength: candidate.content.text.length, deletionText: options.deletionText, text: '', runs: [], issues: [] };
    const cuts = options.deletionText === 'omit' ? candidate.content.annotations.filter(annotation => annotation.kind === 'deletion').map(annotation => annotation.range).sort((a, b) => a.start - b.start) : [];
    let cursor = 0;
    const append = (start: number, end: number) => {
        if (end <= start) return;
        const offset = result.text.length;
        result.text += candidate.content.text.slice(start, end);
        result.runs.push({ start: offset, end: result.text.length, source: { candidateId, start, end } });
    };
    for (const cut of cuts) { append(cursor, Math.max(cursor, cut.start)); cursor = Math.max(cursor, cut.end); }
    append(cursor, candidate.content.text.length);
    result.issues = candidate.content.annotations.filter(annotation => annotation.kind === 'missing-text' && result.runs.some(run => run.source.start < annotation.range.end && run.source.end > annotation.range.start)).map(annotation => ({ code: 'missing-text', annotationId: annotation.id }));
    return result;
}

function checkRange(range: { start: number; end: number }, length: number) {
    if (!Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.end) || range.start < 0 || range.end < range.start || range.end > length) throw new Error('Invalid candidate text range');
}

/** Map projected highlights/search offsets to candidate-local UTF-16 source ranges. */
export function alternativeSourceRangesForText(projection: AlternativeProjection, range: { start: number; end: number }) {
    checkRange(range, projection.text.length);
    return projection.runs.flatMap(run => {
        const start = Math.max(range.start, run.start), end = Math.min(range.end, run.end);
        return end > start ? [{ candidateId: projection.candidateId, start: run.source.start + start - run.start, end: run.source.start + end - run.start }] : [];
    });
}

/** Removed or zero-width source ranges have no visible nonempty intersection. */
export function projectAlternativeSourceRange(projection: AlternativeProjection, range: { candidateId: string; start: number; end: number }) {
    checkRange(range, projection.sourceLength);
    if (range.candidateId !== projection.candidateId) return [];
    return projection.runs.flatMap(run => {
        const start = Math.max(range.start, run.source.start), end = Math.min(range.end, run.source.end);
        return end > start ? [{ start: run.start + start - run.source.start, end: run.start + end - run.source.start }] : [];
    });
}

/** Structural binding only; callers must also verify the exact edition fingerprint. */
export function assertAlternativeAnchors(edition: Edition, study: AlternativesStudy): void {
    const markers = new Map(edition.annotations.filter(annotation => annotation.kind === 'uncompiled-content').map(marker => [marker.id, marker]));
    const parts = new Map(edition.documents.flatMap(document => document.parts).map(part => [part.id, part]));
    const coreIds = new Set([...edition.documents, ...parts.values(), ...edition.annotations, ...edition.annotations.flatMap(annotation => annotation.content?.annotations ?? []), ...edition.entities, ...edition.mentions, ...edition.relations, ...edition.anchors, ...edition.resources].map(record => record.id));
    const sources = new Set(edition.documents.map(document => document.provenance.source));
    for (const record of [...study.witnesses, ...study.groups, ...study.groups.flatMap(group => [...group.candidates, ...group.notes, ...[...group.candidates, ...group.notes].flatMap(owner => owner.content.annotations)])]) {
        if (coreIds.has(record.id)) throw new Error('Study ID collides with an edition record');
        if (!sources.has(record.provenance.source)) throw new Error('Study record refers to an absent document source');
    }
    const witnesses = new Map(study.witnesses.map(witness => [witness.id, witness]));
    for (const group of study.groups) {
        for (const record of [...group.candidates, ...group.notes, ...[...group.candidates, ...group.notes].flatMap(owner => owner.content.annotations)]) if (record.provenance.source !== group.provenance.source) throw new Error('Reading and note provenance must belong to their group source');
        for (const candidate of group.candidates) for (const id of candidate.witnessIds) if (witnesses.get(id)!.provenance.source !== candidate.provenance.source) throw new Error('This study supports local witness declarations only');
    }
    for (const entry of [...study.groups, ...study.diagnostics]) {
        const marker = markers.get(entry.markerId);
        if (!marker?.range || parts.get(marker.range.partId)?.content?.text.slice(marker.range.start, marker.range.end) !== '\uFFFC') throw new Error('Study must anchor to an existing source marker');
        if ('kind' in entry && marker.details.feature !== (entry.kind === 'abbreviation-expansion' ? 'text-alternatives' : 'textual-apparatus')) throw new Error('Alternative group kind differs from its base marker feature');
        if (marker.provenance.source !== entry.provenance.source || marker.provenance.selector !== entry.provenance.selector) throw new Error('Group provenance differs from its marker');
        markers.delete(entry.markerId);
    }
    if (markers.size) throw new Error('Alternatives study is missing source markers');
}
