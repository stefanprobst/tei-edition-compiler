import { DateValueSchema } from '@acdh-oeaw/tei-edition-ir';
import type { Mapping } from './mapping';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
/** Compile-time URI rules; consumers only see resolved IDs or explicit external targets. */
export interface ReferenceMapping {
    documentBaseUri?: string;
    referencePrefixes?: Record<string, string>;
}

export function documentUris(name: string, id: string, uri: string | undefined, mapping: ReferenceMapping) {
    const location = pathToFileURL(resolve('/', name)).href;
    const primary = uri !== undefined ? new URL(uri).href : mapping.documentBaseUri ? new URL(id.split('/').map(encodeURIComponent).join('/'), mapping.documentBaseUri).href : location;
    if (new URL(primary).href.includes('#')) throw new Error('Source document URI must not contain a fragment');
    return { primary, aliases: [...new Set([primary, location])] };
}

export function referenceUri(ref: string, documentUri: string, mapping: ReferenceMapping): URL | undefined {
    const colon = ref.indexOf(':');
    const key = ref.slice(0, colon);
    const prefix = colon > 0 && mapping.referencePrefixes && Object.hasOwn(mapping.referencePrefixes, key) ? mapping.referencePrefixes[key] : undefined;
    const expanded = prefix === undefined ? ref : prefix + ref.slice(colon + 1);
    try {
        const uri = new URL(expanded, documentUri);
        if (uri.hash) uri.hash = encodeURIComponent(decodeURIComponent(uri.hash.slice(1)));
        else if (uri.href.includes('#')) uri.hash = '';
        return uri;
    } catch {
        return undefined;
    }
}

export function annotationReference(ref: string, documentUri: string, mapping: ReferenceMapping) {
    const uri = referenceUri(ref, documentUri, mapping);
    if (!uri?.hash) return undefined;
    const fragment = decodeURIComponent(uri.hash.slice(1));
    uri.hash = '';
    return { source: uri.href, selector: `id(${JSON.stringify(fragment)})`, fragment };
}

/** Only configured authority documents give fragment/bare references a corpus-wide scope. */
export function entityReference(ref: string, documentUri: string, mapping: ReferenceMapping, authorityDocument?: string, bareIdentifier = false) {
    const fragmentRef = bareIdentifier && /^[A-Za-z_][\w.-]*$/.test(ref) ? `#${ref}` : ref;
    if (fragmentRef === '#') return undefined;
    const base = fragmentRef.startsWith('#') && authorityDocument
        ? referenceUri(authorityDocument, documentUri, mapping)?.href
        : documentUri;
    return base ? referenceUri(fragmentRef, base, mapping)?.href : undefined;
}

export const referenceKey = (uri: string, fragment: string) => JSON.stringify([uri, fragment]);

/** Explicit project rule for typed shorthand references, never a runtime URI guess. */
export function mappedDocumentReference(raw: string, type: string, mapping: Mapping): string | undefined {
    const rule = mapping.documentReferenceRules && Object.hasOwn(mapping.documentReferenceRules, type) ? mapping.documentReferenceRules[type] : undefined;
    if (!rule) return raw;
    const valid = rule.targetKind === 'date'
        ? /^\d{4}-\d{2}-\d{2}$/.test(raw) && DateValueSchema.safeParse({ kind: 'exact', value: raw, label: raw }).success
        : /^[A-Za-z_][\w.-]*$/.test(raw);
    return valid ? rule.prefix + encodeURIComponent(raw) + rule.suffix : undefined;
}
