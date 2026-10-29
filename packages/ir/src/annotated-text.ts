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

/** Presentation runs for validated annotated text. Coordinates remain local UTF-16 offsets. */
export function annotatedTextRuns(content: AnnotatedText) {
    const annotations = new Map(content.annotations.map(annotation => [annotation.id, annotation]));
    const depth = (id: string) => { let count = 0; let current = annotations.get(id); while (current?.parentId) { count++; current = annotations.get(current.parentId); } return count; };
    const points = [...new Set([0, content.text.length, ...content.annotations.flatMap(annotation => [annotation.range.start, annotation.range.end])])].sort((a, b) => a - b);
    return points.slice(0, -1).map((start, index) => {
        const end = points[index + 1];
        const covering = content.annotations.filter(annotation => annotation.range.start <= start && annotation.range.end >= end);
        const languages = covering.filter(annotation => annotation.kind === 'language').sort((a, b) => depth(b.id) - depth(a.id) || (a.range.end - a.range.start) - (b.range.end - b.range.start));
        let language = content.language;
        let languageConflict = false;
        if (languages.length) {
            const first = languages[0];
            const tied = languages.filter(annotation => depth(annotation.id) === depth(first.id) && annotation.range.end - annotation.range.start === first.range.end - first.range.start);
            languageConflict = new Set(tied.map(annotation => annotation.language ?? '')).size > 1;
            language = languageConflict ? '' : first.language ?? '';
        }
        return { start, end, text: content.text.slice(start, end), annotations: covering, language, languageConflict };
    });
}
