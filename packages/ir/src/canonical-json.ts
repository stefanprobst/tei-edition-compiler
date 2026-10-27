const canonical = (value: unknown): unknown => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)))
        return Object.fromEntries(Object.entries(value).filter(([, value]) => value !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, canonical(value)]));
    throw new Error('Fingerprint input must contain only JSON data');
};


/** Deterministic JSON shared by artifact producers and browser-side binding checks. */
export const canonicalJson = (value: unknown): string => JSON.stringify(canonical(value));


/** Browser-compatible digest; canonicalize synchronously before the asynchronous hash. */
export async function fingerprintJsonWeb(value: unknown): Promise<string> {
    if (!globalThis.crypto?.subtle) throw new Error('Artifact verification requires Web Crypto');
    const bytes = new TextEncoder().encode(canonicalJson(value));
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}
