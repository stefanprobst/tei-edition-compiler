import { createHash } from 'node:crypto';

/** Hash the UTF-8 representation of the exact supplied text, without normalization. */
export const sha256Text = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

const canonical = (value: unknown): unknown => {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (Array.isArray(value)) return value.map(canonical);
    if (value && typeof value === 'object' && [Object.prototype, null].includes(Object.getPrototypeOf(value)))
        return Object.fromEntries(Object.entries(value).filter(([, value]) => value !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => [key, canonical(value)]));
    throw new Error('Fingerprint input must contain only JSON data');
};

export const fingerprintJson = (value: unknown) => sha256Text(JSON.stringify(canonical(value)));
