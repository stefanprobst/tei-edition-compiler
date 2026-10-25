import type { Provenance } from '@tei-edition/ir';
import { createSourceIndex, TEI_NAMESPACE as NS, XML_NAMESPACE as XML } from './source';
import { referenceUri, type ReferenceMapping } from './references';

export interface Contributor {
    element: Element;
    identity: string;
    label?: string;
    provenance: Provenance;
}

/** Header contributor definitions, independent of transcription mentions and register records. */
export function contributors(header: Element, index: ReturnType<typeof createSourceIndex>, documentUri: string, mapping: ReferenceMapping): Contributor[] {
    const result: Contributor[] = [];
    for (const element of Array.from(header.getElementsByTagNameNS(NS, '*'))) {
        const parent = element.parentNode as Element | null;
        const named = ['name', 'persName'].includes(element.localName) && parent?.namespaceURI === NS && ['editor', 'author', 'respStmt'].includes(parent.localName);
        const direct = ['editor', 'author'].includes(element.localName) && parent?.namespaceURI === NS && ['titleStmt', 'editionStmt'].includes(parent.localName) && Array.from(element.childNodes).filter(n => n.nodeType === 1 && (n as Element).namespaceURI === NS && ['name', 'persName'].includes((n as Element).localName)).length <= 1;
        if (!named && !direct) continue;
        const refs = (element.getAttribute('ref') ?? '').trim().split(/\s+/).filter(Boolean);
        const fragment = element.getAttributeNS(XML, 'id');
        const uri = refs.length === 1 ? referenceUri(refs[0], documentUri, mapping) : !refs.length && fragment ? referenceUri(`#${encodeURIComponent(fragment)}`, documentUri, mapping) : undefined;
        if (!uri) continue;
        const label = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
        result.push({ element, identity: uri.href, ...(label ? { label } : {}), provenance: index.provenance(element) });
    }
    return result;
}
