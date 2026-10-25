import { sha256Text } from './fingerprints';
import { DOMParser } from '@xmldom/xmldom';
import type { Provenance } from '@acdh-oeaw/tei-edition-ir';

export const TEI_NAMESPACE = 'http://www.tei-c.org/ns/1.0';
export const XML_NAMESPACE = 'http://www.w3.org/XML/1998/namespace';

const elements = (node: Node) => Array.from(node.childNodes).filter((n): n is Element => n.nodeType === 1);
const expandedName = (e: Element) => e.namespaceURI === TEI_NAMESPACE ? e.localName : `Q{${encodeURIComponent(e.namespaceURI || '')}}${e.localName}`;

/** A read-only compile-time view of one source. DOM objects never enter the IR. */
export function createSourceIndex(source: { name: string; xml: string }, options: { expectedSha256?: string } = {}) {
    const sha256 = sha256Text(source.xml);
    if (options.expectedSha256 !== undefined) {
        if (typeof options.expectedSha256 !== 'string' || !/^[a-fA-F0-9]{64}$/.test(options.expectedSha256)) throw new Error('Expected source SHA-256 must contain 64 hexadecimal characters');
        if (sha256 !== options.expectedSha256.toLowerCase()) throw new Error(`Source hash mismatch for ${source.name}`);
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(source.xml)) throw new Error('DTD/entity declarations are unsupported');
    const errors: string[] = [];
    const document = new DOMParser({ errorHandler: { warning: m => errors.push(m), error: m => errors.push(m), fatalError: m => errors.push(m) } }).parseFromString(source.xml, 'application/xml') as unknown as Document;
    if (errors.length) throw new Error(`Invalid XML: ${errors.join('; ')}`);
    const root = document.documentElement;
    if (!root || root.namespaceURI !== TEI_NAMESPACE || root.localName !== 'TEI') throw new Error('Expected a TEI document');
    const byId = new Map<string, Element>();
    const selectors = new WeakMap<Element, string>();
    const index = (parent: Node, parentSelector: string) => {
        const counts = new Map<string, number>();
        for (const element of elements(parent)) {
            const name = expandedName(element);
            const position = (counts.get(name) ?? 0) + 1;
            counts.set(name, position);
            const id = element.getAttributeNS(XML_NAMESPACE, 'id');
            if (id && byId.has(id)) throw new Error(`Duplicate xml:id ${JSON.stringify(id)} in ${source.name}`);
            if (id) byId.set(id, element);
            const selector = id ? `id(${JSON.stringify(id)})` : `${parentSelector}/${name}[${position}]`;
            selectors.set(element, selector);
            index(element, selector);
        }
    };
    index(document, '');

    const selector = (element: Element): string => {
        const value = selectors.get(element);
        if (!value) throw new Error('Element does not belong to this source index');
        return value;
    };
    const resolve = (value: string | Provenance): Element | undefined => {
        if (typeof value !== 'string' && value.source !== source.name) return undefined;
        let rest = typeof value === 'string' ? value : value.selector;
        let current: Node = document;
        if (rest.startsWith('id(')) {
            const match = /^id\(("(?:[^"\\]|\\.)*")\)/.exec(rest);
            if (!match) return undefined;
            let id: string;
            try { id = JSON.parse(match[1]); } catch { return undefined; }
            const element = byId.get(id);
            if (!element) return undefined;
            current = element;
            rest = rest.slice(match[0].length);
        } else if (!rest.startsWith('/')) return undefined;
        while (rest) {
            const match = /^\/([^/\[\]]+)\[([1-9]\d*)\]/.exec(rest);
            if (!match) return undefined;
            let name = match[1], namespace = TEI_NAMESPACE;
            if (name.startsWith('Q{')) {
                const expanded = /^Q\{([^}]*)\}(.+)$/.exec(name);
                if (!expanded) return undefined;
                try { namespace = decodeURIComponent(expanded[1]); } catch { return undefined; }
                name = expanded[2];
            }
            const position = Number(match[2]);
            if (!Number.isSafeInteger(position)) return undefined;
            const element = elements(current).filter(e => e.localName === name && (e.namespaceURI || '') === namespace)[position - 1];
            if (!element) return undefined;
            current = element;
            rest = rest.slice(match[0].length);
        }
        return current.nodeType === 1 ? current as Element : undefined;
    };
    return { root, sha256, selector, resolve, provenance: (element: Element): Provenance => ({ source: source.name, selector: selector(element) }) };
}
