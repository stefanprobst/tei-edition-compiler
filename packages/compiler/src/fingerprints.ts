import { canonicalJson } from '@acdh-oeaw/tei-edition-ir';
import { createHash } from 'node:crypto';

/** Hash the UTF-8 representation of the exact supplied text, without normalization. */
export const sha256Text = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

export const fingerprintJson = (value: unknown) => sha256Text(canonicalJson(value));
