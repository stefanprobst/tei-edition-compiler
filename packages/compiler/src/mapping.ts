import { z } from 'zod';
import { EntitySchema } from '@acdh-oeaw/tei-edition-ir';
import audenMusulinProfile from '../profiles/auden-musulin.json';

const nonempty = z.string().min(1);
const authorityScope = nonempty.refine(value => !value.includes('#'), 'Authority document scopes must not contain fragments');
export const MappingSchema = z.object({
    partKinds: z.record(nonempty, nonempty),
    entityKinds: z.record(nonempty, EntitySchema.shape.kind),
    documentTitlePath: z.string().regex(/^[A-Za-z][A-Za-z0-9-]*(\/[A-Za-z][A-Za-z0-9-]*)*$/, 'Expected a TEI child-element path relative to the root').optional(),
    documentDatePaths: z.array(z.string().regex(/^[A-Za-z][A-Za-z0-9-]*(\/[A-Za-z][A-Za-z0-9-]*)*$/, 'Expected a TEI child-element path relative to the root')).optional(),
    elementPartKinds: z.record(nonempty, nonempty).optional(),
    documentBaseUri: z.string().url().refine(value => {
        try { return !new URL(value).href.includes('#') && !!new URL('source.xml', value); } catch { return false; }
    }, 'Document base must support relative URIs and contain no fragment').optional(),
    referencePrefixes: z.record(nonempty, z.string()).optional(),
    documentReferenceRules: z.record(nonempty, z.object({
        prefix: z.string().url().refine(value => !/[?#]/.test(value), 'Reference prefix must not contain query or fragment'),
        suffix: z.string().regex(/^[A-Za-z0-9._-]*$/),
        targetKind: z.enum(['date', 'identifier']),
    }).strict()).optional(),
    authorityLabelTypes: z.object({
        person: z.array(z.string()).min(1).optional(), place: z.array(z.string()).min(1).optional(), organization: z.array(z.string()).min(1).optional(),
        event: z.array(z.string()).min(1).optional(), work: z.array(z.string()).min(1).optional(), unknown: z.array(z.string()).min(1).optional(),
    }).strict().optional(),
    authorityDocuments: z.object({
        person: authorityScope.optional(), place: authorityScope.optional(), organization: authorityScope.optional(),
        event: authorityScope.optional(), work: authorityScope.optional(), unknown: authorityScope.optional(),
    }).strict().optional(),
}).strict();
export type Mapping = z.infer<typeof MappingSchema>;
export const MappingProfileSchema = z.object({ version: z.literal('1'), mapping: MappingSchema }).strict();
export type MappingProfile = z.infer<typeof MappingProfileSchema>;
export const audenMusulinMapping = MappingProfileSchema.parse(audenMusulinProfile).mapping;

/** Source-controlled keys are matched only against declared own mapping entries. */
export const ownEntry = <T>(record: Record<string, T> | undefined, key: string): T | undefined => record && Object.hasOwn(record, key) ? record[key] : undefined;
