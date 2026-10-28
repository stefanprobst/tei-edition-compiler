import type { AnnotatedText } from '@acdh-oeaw/tei-edition-ir';
import { createSourceIndex, TEI_NAMESPACE, XML_NAMESPACE } from './source';
const children = (element: Element) => Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1);
const words = (value: string) => value.split(/\s+/).filter(Boolean);
const value = (element: Element, name: string) => element.getAttribute(name) ?? '';
export const textEvidence = (element: Element) => ({
    responsibilityTokens: words(value(element, 'resp')),
    sourceReferences: words(value(element, 'source')),
    ...(element.hasAttribute('cert') ? { certainty: value(element, 'cert') } : {}),
    details: Object.fromEntries(Object.entries({ type: 'classification', subtype: 'subclassification', rend: 'presentation', cause: 'reason', hand: 'authoringHand', varSeq: 'recordedSequence', place: 'placement', reason: 'extentReason' }).flatMap(([attribute, key]) => element.hasAttribute(attribute) ? [[key, value(element, attribute)]] : [])),
});
const allowed = new Set(['resp', 'source', 'cert', 'type', 'subtype', 'rend', 'cause', 'hand', 'varSeq']);
export function checkTextAttributes(element: Element, witnessed = false, extras: string[] = []) {
    for (const attribute of Array.from(element.attributes)) {
        if (attribute.namespaceURI === 'http://www.w3.org/2000/xmlns/') continue;
        if (attribute.namespaceURI === XML_NAMESPACE && ['id', 'lang'].includes(attribute.localName)) continue;
        if (!attribute.namespaceURI && (allowed.has(attribute.localName) || extras.includes(attribute.localName) || (witnessed && attribute.localName === 'wit'))) continue;
        throw new Error('Unsupported source attribute ' + attribute.name);
    }
}
function declaredLanguage(element: Element): string | undefined {
    let current: Element | null = element;
    while (current) {
        if (current.hasAttributeNS(XML_NAMESPACE, 'lang')) return current.getAttributeNS(XML_NAMESPACE, 'lang') ?? '';
        current = current.parentNode?.nodeType === 1 ? current.parentNode as Element : null;
    }
}

type Content = AnnotatedText;
const inlineKinds = new Map<string, Content['annotations'][number]['kind']>([
    ['del', 'deletion'], ['add', 'insertion'], ['foreign', 'language'], ['hi', 'emphasis'],
    ['am', 'abbreviation-marker'], ['unclear', 'uncertain-reading'], ['supplied', 'supplied-text'], ['title', 'work-title'], ['gap', 'missing-text'],
]);
export function compileAnnotatedText(element: Element, ownerId: string, index: ReturnType<typeof createSourceIndex>, witnessed = false, rootAttributes: string[] = [], onReference?: (element: Element) => void): Content {
    checkTextAttributes(element, witnessed, rootAttributes);
    const language = declaredLanguage(element);
    const result: Content = { kind: 'text', text: '', ...(language !== undefined ? { language } : {}), annotations: [] };
    const walk = (node: Node, parentId?: string) => {
        if (node.nodeType === 3 || node.nodeType === 4) { result.text += node.nodeValue ?? ''; return; }
        if (node.nodeType !== 1) return;
        const child = node as Element;
        if (child.namespaceURI === TEI_NAMESPACE && child.localName === 'ref' && onReference) {
            for (const attribute of Array.from(child.attributes)) {
                if (attribute.namespaceURI === 'http://www.w3.org/2000/xmlns/' || (attribute.namespaceURI === XML_NAMESPACE && attribute.localName === 'id') || (!attribute.namespaceURI && ['target', 'type', 'subtype'].includes(attribute.localName))) continue;
                throw new Error('Unsupported note reference attribute ' + attribute.name);
            }
            if (!value(child, 'target').trim()) throw new Error('Note reference requires a destination');
            onReference(child);
            for (const nested of Array.from(child.childNodes)) walk(nested, parentId);
            return;
        }
        const kind = child.namespaceURI !== TEI_NAMESPACE ? undefined : child.localName === 'hi' && ['super', 'superscript'].includes(value(child, 'rend')) ? 'superscript' : inlineKinds.get(child.localName);
        if (!kind) throw new Error('Unsupported nested reading or note content');
        checkTextAttributes(child, false, kind === 'missing-text' ? ['reason'] : kind === 'insertion' ? ['place'] : []);
        const start = result.text.length;
        const id = ownerId + ':local:' + index.selector(child) + ':' + kind;
        const annotation: Content['annotations'][number] = {
            id, kind, range: { start, end: start }, ...(parentId ? { parentId } : {}),
            ...(kind === 'language' && child.hasAttributeNS(XML_NAMESPACE, 'lang') ? { language: child.getAttributeNS(XML_NAMESPACE, 'lang') ?? '' } : {}),
            provenance: index.provenance(child), ...textEvidence(child),
        };
        result.annotations.push(annotation);
        let languageAnnotation: Content['annotations'][number] | undefined;
        if (kind !== 'language' && child.hasAttributeNS(XML_NAMESPACE, 'lang')) {
            languageAnnotation = { id: id + ':language', kind: 'language', range: { start, end: start }, parentId: id, language: child.getAttributeNS(XML_NAMESPACE, 'lang') ?? '', provenance: index.provenance(child), ...textEvidence(child) };
            result.annotations.push(languageAnnotation);
        }
        if (kind === 'missing-text') {
            if (children(child).length || child.textContent?.trim()) throw new Error('Missing-text marker must not contain a reading');
            result.text += '\uFFFC';
        } else for (const nested of Array.from(child.childNodes)) walk(nested, languageAnnotation?.id ?? id);
        annotation.range.end = result.text.length;
        if (languageAnnotation) languageAnnotation.range.end = result.text.length;
    };
    for (const child of Array.from(element.childNodes)) walk(child);
    return result;
}
