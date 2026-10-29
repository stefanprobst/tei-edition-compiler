import { z } from 'zod';
import { dateExtent, reversedInterval } from './dates';
import { ProvenanceSchema } from './provenance';
import { AnnotatedTextSchema } from './annotated-text';
export { ProvenanceSchema } from './provenance';
export { annotatedTextRuns, AnnotatedTextSchema, LocalAnnotationSchema, textEvidenceFields, type AnnotatedText, type LocalTextAnnotation } from './annotated-text';
const base = { id: z.string().min(1), provenance: ProvenanceSchema };
const DatePointSchema = z.string().refine(v => dateExtent(v) !== undefined, 'Unsupported or invalid Gregorian date value');
export const DateValueSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('exact'), value: DatePointSchema, label: z.string() }).strict(),
    z.object({ kind: z.literal('interval'), start: DatePointSchema.optional(), end: DatePointSchema.optional(), label: z.string() }).strict().refine(v => v.start || v.end, 'Interval requires a bound').refine(v => !v.start || !v.end || !reversedInterval(v.start, v.end), 'Interval bounds are reversed'),
    z.object({ kind: z.literal('text'), label: z.string().min(1) }).strict(),
]);
const RangeSchema = z.object({ partId: z.string(), start: z.number().int().nonnegative(), end: z.number().int().nonnegative() }).strict().refine(v => v.end >= v.start);
export const PartSchema = z.object({ ...base, kind: z.string(), order: z.number().int().nonnegative().safe(), parentId: z.string().optional(), parentOffset: z.number().int().nonnegative().optional(), content: z.object({ kind: z.literal('text'), text: z.string() }).strict().optional(), resourceIds: z.array(z.string()) }).strict();
export const EntitySchema = z.object({ ...base, kind: z.enum(['person', 'place', 'organization', 'event', 'work', 'unknown']), authorityRef: z.string(), label: z.string().optional(), resolution: z.literal('external') }).strict();
export const MentionSchema = z.object({ ...base, entityIds: z.array(z.string()), range: RangeSchema, label: z.string() }).strict();
export const RelationSchema = z.object({ ...base, subjectId: z.string(), predicate: z.string(), objectIds: z.array(z.string()), externalTargets: z.array(z.object({ kind: z.literal('document'), sourceId: z.string().min(1) }).strict()).optional(), description: z.string().optional(), date: DateValueSchema.optional() }).strict();
export const AnnotationSchema = z.object({ ...base, kind: z.string(), targetIds: z.array(z.string()), externalTargets: z.array(z.object({ kind: z.literal('annotation'), source: z.string().url(), selector: z.string().min(1) }).strict()).optional(), parentId: z.string().optional(), range: RangeSchema.optional(), body: z.string().optional(), content: AnnotatedTextSchema.optional(), responsibility: z.array(z.string()), certainty: z.string().optional(), evidence: z.array(z.string()), details: z.record(z.string(), z.string()) }).strict();
export const ResourceSchema = z.object({ ...base, kind: z.literal('image'), uri: z.string().url(), bounds: z.object({ x: z.number(), y: z.number(), width: z.number().nonnegative(), height: z.number().nonnegative() }).strict().optional() }).strict();
export const AnchorSchema = z.object({ ...base, partId: z.string(), order: z.number().int().nonnegative().safe(), offset: z.number().int().nonnegative(), resourceIds: z.array(z.string()), label: z.string().optional() }).strict();
export const DocumentSchema = z.object({ ...base, metadata: z.object({ title: z.string(), dates: z.array(DateValueSchema), languages: z.array(z.string()), identifiers: z.array(z.string()), rights: z.array(z.string()) }).strict(), parts: z.array(PartSchema), resourceIds: z.array(z.string()), relationIds: z.array(z.string()), annotationIds: z.array(z.string()) }).strict();
export const EditionSchema = z.object({ version: z.literal('0.4'), id: z.string(), documents: z.array(DocumentSchema), entities: z.array(EntitySchema), mentions: z.array(MentionSchema), relations: z.array(RelationSchema), annotations: z.array(AnnotationSchema), resources: z.array(ResourceSchema), anchors: z.array(AnchorSchema), diagnostics: z.array(z.object({ code: z.string(), message: z.string(), provenance: ProvenanceSchema }).strict()) }).strict().superRefine((v, ctx) => {
    const objects = [...v.documents, ...v.documents.flatMap(d => d.parts), ...v.entities, ...v.mentions, ...v.relations, ...v.annotations, ...v.resources, ...v.anchors];
    const ids = new Set<string>();
    for (const o of objects) {
        if (ids.has(o.id))
            ctx.addIssue({ code: 'custom', message: `Duplicate ID ${o.id}` });
        ids.add(o.id);
    }
    const contentIds = new Set(ids);
    for (const annotation of v.annotations) for (const local of annotation.content?.annotations ?? []) {
        if (contentIds.has(local.id)) ctx.addIssue({ code: 'custom', message: 'Duplicate content ID ' + local.id });
        contentIds.add(local.id);
        if (local.provenance.source !== annotation.provenance.source) ctx.addIssue({ code: 'custom', message: 'Content provenance must belong to its owner source' });
    }
    const parts = new Map(v.documents.flatMap(d => d.parts).map(p => [p.id, p]));
    const entities = new Map(v.entities.map(e => [e.id, e]));
    const annotations = new Map(v.annotations.map(a => [a.id, a]));
    const resources = new Map(v.resources.map(r => [r.id, r]));
    const relations = new Map(v.relations.map(r => [r.id, r]));
    const issue = (message: string) => ctx.addIssue({ code: 'custom', message });
    const check = (id: string, category?: ReadonlyMap<string, unknown>) => {
        if (!ids.has(id)) issue(`Unresolved internal ID ${id}`);
        else if (category && !category.has(id)) issue(`Incorrect reference category for ${id}`);
    };
    const range = (r: z.infer<typeof RangeSchema>) => {
        check(r.partId, parts);
        if (r.end > (parts.get(r.partId)?.content?.text.length ?? 0)) issue('Range exceeds content');
    };
    const checkCycles = (items: ReadonlyMap<string, { parentId?: string }>) => {
        const complete = new Set<string>();
        for (const id of items.keys()) {
            const path = new Set<string>();
            let current: string | undefined = id;
            while (current && items.has(current) && !complete.has(current)) {
                if (path.has(current)) { issue(`Parent cycle at ${current}`); break; }
                path.add(current);
                current = items.get(current)?.parentId;
            }
            for (const visited of path) complete.add(visited);
        }
    };
    for (const d of v.documents) {
        d.resourceIds.forEach(id => check(id, resources));
        d.relationIds.forEach(id => check(id, relations));
        d.annotationIds.forEach(id => check(id, annotations));
        const localParts = new Map(d.parts.map(p => [p.id, p]));
        const positions = [
            ...d.parts.map(p => ({ kind: 'part', id: p.id, ownerId: p.parentId, offset: p.parentOffset, order: p.order })),
            ...v.anchors.filter(a => localParts.has(a.partId)).map(a => ({ kind: 'anchor', id: a.id, ownerId: a.partId, offset: a.offset, order: a.order })),
        ].sort((a, b) => a.order - b.order);
        const seenOrders = new Set<number>();
        const activeParts: string[] = [];
        const offsets = new Map<string, number>();
        for (const position of positions) {
            if (seenOrders.has(position.order)) issue(`Duplicate document order ${position.order} in ${d.id}`);
            seenOrders.add(position.order);
            if (position.ownerId === undefined) activeParts.length = 0;
            else {
                const ownerIndex = activeParts.indexOf(position.ownerId);
                if (ownerIndex < 0) issue(`Order reopens or precedes parent part ${position.ownerId}`);
                else activeParts.length = ownerIndex + 1;
                const offset = position.offset ?? 0;
                if (offset < (offsets.get(position.ownerId) ?? 0)) issue(`Order reverses offsets within ${position.ownerId}`);
                offsets.set(position.ownerId, offset);
            }
            if (position.kind === 'part') activeParts.push(position.id);
        }
        for (const p of d.parts) {
            p.resourceIds.forEach(id => check(id, resources));
            if ((p.parentId === undefined) !== (p.parentOffset === undefined)) issue('Nested parts require both parentId and parentOffset');
            if (p.parentId !== undefined) {
                check(p.parentId, localParts);
                if ((p.parentOffset ?? 0) > (localParts.get(p.parentId)?.content?.text.length ?? 0)) issue('Nested part offset exceeds parent content');
            }
        }
    }
    for (const m of v.mentions) {
        m.entityIds.forEach(id => check(id, entities));
        range(m.range);
        const content = parts.get(m.range.partId)?.content?.text ?? '';
        if (content.slice(m.range.start, m.range.end) !== m.label) issue('Mention label differs from its content range');
    }
    for (const a of v.annotations) {
        if (a.content && a.body !== undefined) issue('Annotation cannot have both body and structured content');
        if (a.kind === 'note' && a.body !== undefined) issue('Notes use structured content');
        if (a.kind === 'note' && a.details.contentStatus === 'compiled' && !a.content) issue('Compiled notes require structured content');
        if (a.kind === 'note' && a.details.contentStatus === 'uncompiled' && a.content) issue('Uncompiled notes cannot claim structured content');
        a.targetIds.forEach(id => check(id));
        if (a.range) range(a.range);
        if (a.parentId !== undefined) {
            check(a.parentId, annotations);
            const parent = annotations.get(a.parentId)?.range;
            if (!a.range || !parent || a.range.partId !== parent.partId || a.range.start < parent.start || a.range.end > parent.end) issue('Nested annotation must lie within its parent range');
        }
    }
    for (const r of v.relations) {
        check(r.subjectId);
        r.objectIds.forEach(id => check(id));
        if (r.predicate === 'contains-part') {
            check(r.subjectId, annotations);
            const owner = annotations.get(r.subjectId)?.range;
            if (!r.objectIds.length) issue('Part containment requires a target');
            for (const id of r.objectIds) {
                check(id, parts);
                const child = parts.get(id);
                if (!owner || !child || child.parentId !== owner.partId || child.parentOffset === undefined || child.parentOffset < owner.start || child.parentOffset > owner.end)
                    issue('Contained part must occur within its annotation in the parent part');
            }
        }
    }
    for (const a of v.anchors) {
        check(a.partId, parts);
        a.resourceIds.forEach(id => check(id, resources));
        if (a.offset > (parts.get(a.partId)?.content?.text.length ?? 0)) issue('Anchor exceeds content');
    }
    checkCycles(parts);
    checkCycles(annotations);
});
export type Edition = z.infer<typeof EditionSchema>;
export type DateValue = z.infer<typeof DateValueSchema>;
export type Provenance = z.infer<typeof ProvenanceSchema>;

export { documentEvents, type DocumentEvent } from './reading-order';
export { projectDocumentText, projectSourceRange, sourceRangesForText, type TextProjection, type PartTextRange, type TextRange } from './text-projection';
export { partLanguageRuns, type LanguageRun } from './languages';
export { summarizeEdition, type EditionSummary } from './summary';

export { canonicalJson } from './canonical-json';


/** Every emitted source-backed record, including annotation-local content spans. */
export function editionProvenanceRecords(edition: Edition) {
    return [...edition.documents, ...edition.documents.flatMap(document => document.parts), ...edition.entities,
        ...edition.mentions, ...edition.relations, ...edition.annotations,
        ...edition.annotations.flatMap(annotation => annotation.content?.annotations ?? []),
        ...edition.resources, ...edition.anchors, ...edition.diagnostics];
}

export { entityDisplayName } from './entity-display';
