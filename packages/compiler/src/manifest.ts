import { z } from 'zod';
import { EditionSchema, type Edition } from '@tei-edition/ir';
import type { CompileOptions, Mapping, Source } from './index';
import { fingerprintJson, sha256Text } from './fingerprints';
import { createSourceIndex } from './source';

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

export function buildManifest(edition: Edition, sources: Source[], mapping: Mapping, options: CompileOptions): CompilationManifest {
    return CompilationManifestSchema.parse({
        version: '1', irVersion: edition.version,
        editionSha256: fingerprintJson(edition), mappingSha256: fingerprintJson(mapping),
        sources: [
            ...sources.map(s => ({ name: s.name, role: 'document', ...(s.uri ? { uri: new URL(s.uri).href } : {}), sha256: sha256Text(s.xml) })),
            ...(options.authorities ?? []).map(s => ({ name: s.name, role: 'authority', uri: new URL(s.uri).href, sha256: sha256Text(s.xml) })),
        ],
    });
}

/** Validate untrusted sidecar data and bind its source inventory to a validated edition. */
export function verifyCompilationManifest(edition: Edition, input: unknown): CompilationManifest {
    const manifest = CompilationManifestSchema.parse(input);
    if (manifest.editionSha256 !== fingerprintJson(edition)) throw new Error('Edition does not match compilation manifest');
    const sources = new Map(manifest.sources.map(source => [source.name, source]));
    const records = [
        ...edition.documents, ...edition.documents.flatMap(d => d.parts), ...edition.entities,
        ...edition.mentions, ...edition.relations, ...edition.annotations, ...edition.resources,
        ...edition.anchors, ...edition.diagnostics,
    ];
    for (const record of records) if (!sources.has(record.provenance.source)) throw new Error('Compilation manifest is missing provenance source ' + record.provenance.source);
    for (const document of edition.documents) if (sources.get(document.provenance.source)?.role !== 'document') throw new Error('Document provenance must refer to a document-role manifest source');
    return manifest;
}

/** Source inspection only: verify every supplied revision and every emitted selector. No fetching. */
export function verifyCompilationSources(edition: Edition, input: unknown, sources: readonly { name: string; xml: string }[]) {
    const manifest = verifyCompilationManifest(edition, input);
    const expected = new Map(manifest.sources.map(source => [source.name, source]));
    const indexes = new Map<string, ReturnType<typeof createSourceIndex>>();
    for (const source of sources) {
        if (indexes.has(source.name)) throw new Error('Duplicate supplied source ' + source.name);
        const entry = expected.get(source.name);
        if (!entry) throw new Error('Source is absent from compilation manifest: ' + source.name);
        indexes.set(source.name, createSourceIndex(source, { expectedSha256: entry.sha256 }));
    }
    for (const name of expected.keys()) if (!indexes.has(name)) throw new Error('Missing supplied source ' + name);
    const records = [
        ...edition.documents, ...edition.documents.flatMap(d => d.parts), ...edition.entities,
        ...edition.mentions, ...edition.relations, ...edition.annotations, ...edition.resources,
        ...edition.anchors, ...edition.diagnostics,
    ];
    for (const record of records) {
        if (!indexes.get(record.provenance.source)!.resolve(record.provenance)) {
            throw new Error('Unresolved provenance in ' + record.provenance.source + ': ' + record.provenance.selector);
        }
    }
    return { verifiedSources: indexes.size, verifiedProvenanceRecords: records.length };
}
