import { z } from 'zod';
import { EntitySchema } from '@tei-edition/ir';
import audenMusulinProfile from '../profiles/auden-musulin.json';

const nonempty = z.string().min(1);
const authorityScope = nonempty.refine(value => !value.includes('#'), 'Authority document scopes must not contain fragments');
export const MappingSchema = z.object({
    partKinds: z.record(nonempty, nonempty),
    entityKinds: z.record(nonempty, EntitySchema.shape.kind),
    elementPartKinds: z.record(nonempty, nonempty).optional(),
    documentBaseUri: z.string().url().refine(value => {
        try { return !new URL(value).href.includes('#') && !!new URL('source.xml', value); } catch { return false; }
    }, 'Document base must support relative URIs and contain no fragment').optional(),
    referencePrefixes: z.record(nonempty, z.string()).optional(),
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
