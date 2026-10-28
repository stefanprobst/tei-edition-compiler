import { z } from 'zod';
import { ProvenanceSchema } from './provenance';

export const textEvidenceFields = {
    responsibilityTokens: z.array(z.string()),
    sourceReferences: z.array(z.string()),
    certainty: z.string().optional(),
    details: z.record(z.string(), z.string()),
};
const record = { id: z.string().min(1), provenance: ProvenanceSchema };
const LocalRangeSchema = z.object({ start: z.number().int().nonnegative().safe(), end: z.number().int().nonnegative().safe() }).strict().refine(range => range.end >= range.start, 'Reversed local range');
export const LocalAnnotationSchema = z.object({
    ...record, kind: z.enum(['deletion', 'insertion', 'language', 'emphasis', 'uncertain-reading', 'supplied-text', 'work-title', 'missing-text', 'abbreviation-marker', 'superscript']),
    range: LocalRangeSchema, parentId: z.string().optional(), language: z.string().optional(), ...textEvidenceFields,
}).strict();
export const AnnotatedTextSchema = z.object({
    kind: z.literal('text'), text: z.string(), language: z.string().optional(), annotations: z.array(LocalAnnotationSchema),
}).strict().superRefine((content, context) => {
    const annotations = new Map(content.annotations.map(annotation => [annotation.id, annotation]));
    const issue = (message: string) => context.addIssue({ code: 'custom', message });
    if (annotations.size !== content.annotations.length) issue('Duplicate local annotation ID');
    for (const annotation of content.annotations) {
        if (annotation.range.end > content.text.length) issue('Local annotation exceeds content');
        if (annotation.language !== undefined && annotation.kind !== 'language') issue('Language value requires a language annotation');
        if (annotation.kind === 'missing-text' && content.text.slice(annotation.range.start, annotation.range.end) !== '\uFFFC') issue('Missing text requires a source marker');
        if (annotation.parentId) {
            const parent = annotations.get(annotation.parentId);
            if (!parent || annotation.range.start < parent.range.start || annotation.range.end > parent.range.end) issue('Local annotation must lie within its own content parent');
        }
        const seen = new Set<string>(); let current: string | undefined = annotation.id;
        while (current && annotations.has(current)) {
            if (seen.has(current)) { issue('Local annotation parent cycle'); break; }
            seen.add(current); current = annotations.get(current)?.parentId;
        }
    }
});

export type AnnotatedText = z.infer<typeof AnnotatedTextSchema>;

export type LocalTextAnnotation = z.infer<typeof LocalAnnotationSchema>;
