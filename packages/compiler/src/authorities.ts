import type { Edition, Provenance } from '@acdh-oeaw/tei-edition-ir';
import { createSourceIndex, TEI_NAMESPACE as NS, XML_NAMESPACE as XML } from './source';
import { referenceUri, type ReferenceMapping } from './references';

type Kind = Edition['entities'][number]['kind'];
export interface AuthoritySource { name: string; xml: string; uri: string }
export interface AuthorityRecord { kind: Kind; label?: string; provenance: Provenance }
type Report = (code: string, message: string, provenance: Provenance) => void;
const records: Record<string, { kind: Kind; label: string }> = {
    person: { kind: 'person', label: 'persName' }, place: { kind: 'place', label: 'placeName' },
    org: { kind: 'organization', label: 'orgName' }, event: { kind: 'event', label: 'label' },
    bibl: { kind: 'work', label: 'title' },
};
const labelText = (element: Element): string => Array.from(element.childNodes).map(n => n.nodeType === 1 ? labelText(n as Element) : n.nodeType === 3 || n.nodeType === 4 ? n.nodeValue ?? '' : '').join(' ').replace(/\s+/g, ' ').replace(/\s+([,.;:!?])/g, '$1').trim();

/** Explicit, supplied TEI authority records only. No fetching, fuzzy matching or XML serialization. */
export function indexAuthorities(sources: AuthoritySource[], mapping: ReferenceMapping, report: Report): Map<string, AuthorityRecord> {
    const result = new Map<string, AuthorityRecord>();
    const seenUris = new Set<string>();
    for (const source of sources) {
        if (!source.uri) throw new Error('Authority sources require an explicit absolute URI');
        const uri = new URL(source.uri);
        if (uri.href.includes('#')) throw new Error('Authority source URI must not contain a fragment');
        if (seenUris.has(uri.href)) throw new Error(`Duplicate authority source URI ${uri.href}`);
        seenUris.add(uri.href);
        const index = createSourceIndex(source);
        let recognized = 0;
        for (const element of Array.from(index.root.getElementsByTagNameNS(NS, '*'))) {
            const rule = Object.hasOwn(records, element.localName) ? records[element.localName] : undefined;
            if (!rule) continue;
            // Only actual register entries, not names or references nested inside descriptions.
            const expectedParent = { person: 'listPerson', place: 'listPlace', org: 'listOrg', event: 'listEvent', bibl: 'listBibl' }[element.localName];
            const parent = element.parentNode as Element | null;
            if (parent?.namespaceURI !== NS || parent.localName !== expectedParent) continue;
            recognized++;
            const provenance = index.provenance(element);
            const fragment = element.getAttributeNS(XML, 'id');
            if (!fragment) { report('authority-record-without-id', `Authority ${rule.kind} record has no XML ID`, provenance); continue; }
            const identity = referenceUri(`#${encodeURIComponent(fragment)}`, uri.href, mapping)!.href;
            const labels = [...new Set(Array.from(element.childNodes).filter((n): n is Element => n.nodeType === 1 && (n as Element).namespaceURI === NS && (n as Element).localName === rule.label).map(labelText).filter(Boolean))];
            if (labels.length !== 1) report(labels.length ? 'ambiguous-authority-label' : 'missing-authority-label', `${identity}: ${labels.length ? labels.join(' | ') : 'no display label'}`, provenance);
            result.set(identity, { kind: rule.kind, ...(labels.length === 1 ? { label: labels[0] } : {}), provenance });
        }
        if (!recognized) report('no-authority-records', 'No supported TEI authority register entries were found', index.provenance(index.root));
    }
    return result;
}
