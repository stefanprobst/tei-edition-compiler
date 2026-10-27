import { z } from 'zod';
import { EditionSchema, editionProvenanceRecords, type Edition } from './index';
import { fingerprintJsonWeb } from './canonical-json';

const HashSchema = z.string().regex(/^[a-fA-F0-9]{64}$/, 'Expected a SHA-256 hexadecimal digest').transform(value => value.toLowerCase());
const SourceSchema = z.object({
    name: z.string().min(1),
    role: z.enum(['document', 'authority']),
    uri: z.string().url().refine(value => {
        try { return !new URL(value).href.includes('#'); } catch { return false; }
    }, 'Source URI must be absolute and contain no fragment').transform(value => new URL(value).href).optional(),
    sha256: HashSchema,
}).strict();

export const CompilationManifestSchema = z.object({
    version: z.literal('1'),
    irVersion: EditionSchema.shape.version,
    editionSha256: HashSchema,
    mappingSha256: HashSchema,
    sources: z.array(SourceSchema),
}).strict().superRefine((manifest, context) => {
    const names = new Set<string>(), uris = new Set<string>();
    for (const [index, source] of manifest.sources.entries()) {
        if (names.has(source.name)) context.addIssue({ code: 'custom', path: ['sources', index, 'name'], message: 'Duplicate source name' });
        names.add(source.name);
        if (source.role === 'authority' && !source.uri) context.addIssue({ code: 'custom', path: ['sources', index, 'uri'], message: 'Authority sources require an explicit URI' });
        if (source.uri) {
            const key = JSON.stringify([source.role, source.uri]);
            if (uris.has(key)) context.addIssue({ code: 'custom', path: ['sources', index, 'uri'], message: 'Duplicate source URI within this role' });
            uris.add(key);
        }
    }
});
export type CompilationManifest = z.infer<typeof CompilationManifestSchema>;

export function assertManifestSources(edition: Edition, manifest: CompilationManifest): void {
    const sources = new Map(manifest.sources.map(source => [source.name, source]));
    const records = editionProvenanceRecords(edition);
    for (const record of records) if (!sources.has(record.provenance.source)) throw new Error('Compilation manifest is missing provenance source ' + record.provenance.source);
    for (const document of edition.documents) if (sources.get(document.provenance.source)?.role !== 'document') throw new Error('Document provenance must refer to a document-role manifest source');
}

/** Verify JSON artifact consistency only; source XML and mapping files are not loaded. */
export async function verifyCompilationManifestArtifact(editionInput: Edition, input: unknown): Promise<CompilationManifest> {
    const edition = EditionSchema.parse(editionInput);
    const manifest = CompilationManifestSchema.parse(input);
    if (manifest.editionSha256 !== await fingerprintJsonWeb(edition)) throw new Error('Edition does not match compilation manifest');
    assertManifestSources(edition, manifest);
    return manifest;
}
