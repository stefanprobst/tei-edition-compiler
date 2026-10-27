import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';
import { CompilationManifestSchema, verifyCompilationManifestArtifact } from '@acdh-oeaw/tei-edition-ir/compilation-manifest';
import { AlternativesStudySchema, assertAlternativeAnchors } from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';

export type Presentation = { version: '1'; editionSha256: string; attribution: string; sourceLinks: Record<string, string>; previews: Record<string, string> };
export type ArtifactInputs = { edition: unknown; manifest: unknown; alternatives?: unknown; presentation?: unknown };
const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

function presentationMetadata(input: unknown): Presentation {
    if (!object(input) || Object.keys(input).some(key => !['version', 'editionSha256', 'attribution', 'sourceLinks', 'previews'].includes(key))) throw new Error('Presentation metadata has an invalid structure');
    if (input.version !== '1' || typeof input.editionSha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(input.editionSha256) || typeof input.attribution !== 'string') throw new Error('Presentation metadata requires version 1, an edition SHA-256 and attribution text');
    const urls = (value: unknown): Record<string, string> => {
        if (!object(value)) throw new Error('Presentation URL maps must be JSON objects');
        const result: Record<string, string> = Object.create(null);
        for (const [key, uri] of Object.entries(value)) {
            if (typeof uri !== 'string') throw new Error('Presentation URLs must be strings');
            let url: URL;
            try { url = new URL(uri); } catch { throw new Error('Presentation URLs must be absolute HTTP(S) URLs'); }
            if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Presentation URLs must use HTTP(S)');
            result[key] = url.href;
        }
        return result;
    };
    return { version: '1', editionSha256: input.editionSha256.toLowerCase(), attribution: input.attribution, sourceLinks: urls(input.sourceLinks), previews: urls(input.previews) };
}

/** Validate all supplied JSON before a caller replaces its current view. No source/sidecar fetching. */
export async function validateArtifactSet(input: ArtifactInputs) {
    const editionResult = EditionSchema.safeParse(input.edition);
    if (!editionResult.success) throw new Error('Edition must be valid IR v0.3');
    const manifestResult = CompilationManifestSchema.safeParse(input.manifest);
    if (!manifestResult.success) throw new Error('Manifest must be a valid compilation manifest for IR v0.3');
    const edition = editionResult.data, manifest = manifestResult.data;
    const studyResult = input.alternatives === undefined ? undefined : AlternativesStudySchema.safeParse(input.alternatives);
    if (studyResult && !studyResult.success) throw new Error('Alternatives must be a valid experimental v0.2 extension');
    const alternatives = studyResult?.success ? studyResult.data : undefined;
    const presentation = input.presentation === undefined ? { version: '1' as const, editionSha256: manifest.editionSha256, attribution: '', sourceLinks: Object.create(null) as Record<string, string>, previews: Object.create(null) as Record<string, string> } : presentationMetadata(input.presentation);
    await verifyCompilationManifestArtifact(edition, manifest);
    if (alternatives) {
        if (alternatives.editionSha256 !== manifest.editionSha256) throw new Error('Alternatives do not match the loaded edition');
        assertAlternativeAnchors(edition, alternatives);
    }
    if (presentation.editionSha256 !== manifest.editionSha256) throw new Error('Presentation metadata does not match the loaded edition');
    const sourceNames = new Set(manifest.sources.map(source => source.name));
    const resourceIds = new Set(edition.resources.map(resource => resource.id));
    for (const source of Object.keys(presentation.sourceLinks)) if (!sourceNames.has(source)) throw new Error('Presentation source link is absent from the manifest: ' + source);
    for (const resource of Object.keys(presentation.previews)) if (!resourceIds.has(resource)) throw new Error('Presentation preview refers to an unknown resource: ' + resource);
    return { edition, manifest, alternatives, presentation, supplied: { alternatives: input.alternatives !== undefined, presentation: input.presentation !== undefined } };
}

export async function readArtifactFiles(files: { edition: File; manifest: File; alternatives?: File; presentation?: File }) {
    const inputs: Record<string, unknown> = {};
    await Promise.all(Object.entries(files).filter((entry): entry is [string, File] => entry[1] !== undefined).map(async ([role, file]) => {
        try { inputs[role] = JSON.parse(await file.text()); }
        catch { throw new Error(role[0].toUpperCase() + role.slice(1) + ' file is not valid JSON'); }
    }));
    return validateArtifactSet(inputs as ArtifactInputs);
}
