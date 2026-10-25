import type { Edition, Provenance } from '@acdh-oeaw/tei-edition-ir';
import { referenceUri, type ReferenceMapping } from './references';
import { TEI_NAMESPACE as NS, XML_NAMESPACE as XML } from './source';

type Resource = Edition['resources'][number];
interface Options {
    root: Element;
    documentUri: string;
    aliases: string[];
    mapping: ReferenceMapping;
    id: (element: Element) => string;
    provenance: (element: Element) => Provenance;
    report: (code: string, message: string, element: Element) => void;
}

export function createFacsimileIndex(options: Options) {
    const { root, documentUri, aliases, mapping, id, provenance, report } = options;
    const resources: Resource[] = [];
    const byUri = new Map<string, string[]>();
    const byFragment = new Map<string, string[]>();
    const add = (index: Map<string, string[]>, key: string, resourceId: string) => {
        const values = index.get(key) ?? [];
        if (!values.includes(resourceId)) values.push(resourceId);
        index.set(key, values);
    };
    const bases = new WeakMap<Element, string | null>();
    const uriFor = (raw: string, base: string | undefined) => (base || /^[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) ? referenceUri(raw, base ?? documentUri, mapping)?.href : undefined;
    const baseUri = (element: Element): string | undefined => {
        if (bases.has(element)) return bases.get(element) ?? undefined;
        const parent = element.parentNode;
        const inherited = parent?.nodeType === 1 ? baseUri(parent as Element) : documentUri;
        const declared = element.getAttributeNS(XML, 'base');
        const base = declared ? uriFor(declared, inherited) : inherited;
        if (declared && !base) report('invalid-resource-base', declared, element);
        bases.set(element, base ?? null);
        return base;
    };
    const pointer = (element: Element, resourceId: string) => {
        const fragment = element.getAttributeNS(XML, 'id');
        if (!fragment) return;
        add(byFragment, fragment, resourceId);
        for (const alias of aliases) {
            const uri = referenceUri(`#${encodeURIComponent(fragment)}`, alias, mapping);
            if (uri) add(byUri, uri.href, resourceId);
        }
    };
    for (const surface of Array.from(root.getElementsByTagNameNS(NS, 'surface'))) {
        const names = ['ulx', 'uly', 'lrx', 'lry'];
        const present = names.filter(name => surface.hasAttribute(name));
        let bounds: Resource['bounds'];
        if (present.length && present.length !== names.length) {
            report('incomplete-surface-bounds', 'Surface bounds require all four coordinates', surface);
        } else if (present.length) {
            const values = names.map(name => surface.getAttribute(name)?.trim() ?? '');
            const [x, y, right, bottom] = values.map(Number);
            if (values.every(v => /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(v)) && [x, y, right, bottom, right - x, bottom - y].every(Number.isFinite) && right >= x && bottom >= y) bounds = { x, y, width: right - x, height: bottom - y };
            else report('invalid-surface-bounds', names.map((name, i) => `${name}=${JSON.stringify(values[i])}`).join(', '), surface);
        }
        for (const graphic of Array.from(surface.getElementsByTagNameNS(NS, 'graphic'))) {
            let owner = graphic.parentNode as Element | null;
            while (owner && !(owner.namespaceURI === NS && owner.localName === 'surface')) owner = owner.parentNode as Element | null;
            if (owner !== surface) continue;
            const raw = graphic.getAttribute('url')?.trim() ?? '';
            const base = baseUri(graphic);
            const uri = raw ? uriFor(raw, base) : undefined;
            if (!uri) { report('invalid-resource-uri', raw || 'Missing graphic URL or usable base URI', graphic); continue; }
            const resourceId = id(graphic);
            resources.push({ id: resourceId, kind: 'image', uri, ...(bounds ? { bounds } : {}), provenance: provenance(graphic) });
            add(byUri, uri, resourceId);
            pointer(surface, resourceId);
            pointer(graphic, resourceId);
        }
    }
    const resolve = (element: Element): string[] => {
        const raw = element.getAttribute('facs') ?? '';
        const pointers = [...new Set(raw.trim().split(/\s+/).filter(Boolean))];
        if (element.hasAttribute('facs') && !pointers.length) report('unresolved-facsimile', raw, element);
        const result: string[] = [];
        for (const ref of pointers) {
            let found: string[] | undefined;
            if (ref.startsWith('#')) {
                try { found = byFragment.get(decodeURIComponent(ref.slice(1))); } catch { /* Diagnosed below. */ }
            } else {
                const base = baseUri(element);
                const uri = uriFor(ref, base);
                if (uri) found = byUri.get(uri);
            }
            if (found?.length) result.push(...found);
            else report('unresolved-facsimile', ref, element);
        }
        return [...new Set(result)];
    };
    return { resources, resolve };
}
