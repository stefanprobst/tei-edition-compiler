import { CompilationManifestSchema, assertManifestSources, type CompilationManifest } from '@acdh-oeaw/tei-edition-ir/compilation-manifest';
export { CompilationManifestSchema, type CompilationManifest } from '@acdh-oeaw/tei-edition-ir/compilation-manifest';
import { editionProvenanceRecords, type Edition } from '@acdh-oeaw/tei-edition-ir';
import type { CompileOptions, Mapping, Source } from './index';
import { fingerprintJson, sha256Text } from './fingerprints';
import { createSourceIndex } from './source';

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
    assertManifestSources(edition, manifest);
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
    const records = editionProvenanceRecords(edition);
    for (const record of records) {
        if (!indexes.get(record.provenance.source)!.resolve(record.provenance)) {
            throw new Error('Unresolved provenance in ' + record.provenance.source + ': ' + record.provenance.selector);
        }
    }
    return { verifiedSources: indexes.size, verifiedProvenanceRecords: records.length };
}
