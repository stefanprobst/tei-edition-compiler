import { AlternativesStudySchema, assertAlternativeAnchors, type AlternativesStudy } from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';
import type { Edition } from '@acdh-oeaw/tei-edition-ir';
import { createSourceIndex, TEI_NAMESPACE, XML_NAMESPACE } from '../source';
import { verifyCompilationManifest, verifyCompilationSources } from '../manifest';
import { fingerprintJson } from '../fingerprints';

type Input = { name: string; xml: string };
const children = (element: Element) => Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1);
const words = (value: string) => value.split(/\s+/).filter(Boolean);
const value = (element: Element, name: string) => element.getAttribute(name) ?? '';
const evidence = (element: Element) => ({
    responsibilityTokens: words(value(element, 'resp')),
    sourceReferences: words(value(element, 'source')),
    ...(element.hasAttribute('cert') ? { certainty: value(element, 'cert') } : {}),
    details: Object.fromEntries(Object.entries({ type: 'classification', subtype: 'subclassification', rend: 'presentation', cause: 'reason', hand: 'authoringHand', varSeq: 'recordedSequence', place: 'placement', reason: 'extentReason' }).flatMap(([attribute, key]) => element.hasAttribute(attribute) ? [[key, value(element, attribute)]] : [])),
});
const allowed = new Set(['resp', 'source', 'cert', 'type', 'subtype', 'rend', 'cause', 'hand', 'varSeq']);
function checkAttributes(element: Element, witnessed = false, extras: string[] = []) {
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

type Content = AlternativesStudy['groups'][number]['candidates'][number]['content'];
const inlineKinds = new Map<string, Content['annotations'][number]['kind']>([
    ['del', 'deletion'], ['add', 'insertion'], ['foreign', 'language'], ['hi', 'emphasis'],
    ['unclear', 'uncertain-reading'], ['supplied', 'supplied-text'], ['title', 'work-title'], ['gap', 'missing-text'],
]);
function compileContent(element: Element, ownerId: string, index: ReturnType<typeof createSourceIndex>, witnessed = false): Content {
    checkAttributes(element, witnessed);
    const language = declaredLanguage(element);
    const result: Content = { kind: 'text', text: '', ...(language !== undefined ? { language } : {}), annotations: [] };
    const walk = (node: Node, parentId?: string) => {
        if (node.nodeType === 3 || node.nodeType === 4) { result.text += node.nodeValue ?? ''; return; }
        if (node.nodeType !== 1) return;
        const child = node as Element;
        const kind = child.namespaceURI === TEI_NAMESPACE ? inlineKinds.get(child.localName) : undefined;
        if (!kind) throw new Error('Unsupported nested reading or note content');
        checkAttributes(child, false, kind === 'missing-text' ? ['reason'] : kind === 'insertion' ? ['place'] : []);
        const start = result.text.length;
        const id = ownerId + ':local:' + index.selector(child) + ':' + kind;
        const annotation: Content['annotations'][number] = {
            id, kind, range: { start, end: start }, ...(parentId ? { parentId } : {}),
            ...(kind === 'language' && child.hasAttributeNS(XML_NAMESPACE, 'lang') ? { language: child.getAttributeNS(XML_NAMESPACE, 'lang') ?? '' } : {}),
            provenance: index.provenance(child), ...evidence(child),
        };
        result.annotations.push(annotation);
        let languageAnnotation: Content['annotations'][number] | undefined;
        if (kind !== 'language' && child.hasAttributeNS(XML_NAMESPACE, 'lang')) {
            languageAnnotation = { id: id + ':language', kind: 'language', range: { start, end: start }, parentId: id, language: child.getAttributeNS(XML_NAMESPACE, 'lang') ?? '', provenance: index.provenance(child), ...evidence(child) };
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

/** Experimental, explicit-input study. Leaves the validated v0.2 edition and its diagnostics unchanged. */
export function compileAlternativesStudy(edition: Edition, manifestInput: unknown, sources: readonly Input[]): AlternativesStudy {
    const manifest = verifyCompilationManifest(edition, manifestInput);
    verifyCompilationSources(edition, manifest, sources);
    const hashes = new Map(manifest.sources.map(source => [source.name, source.sha256]));
    const indexes = new Map(sources.map(source => [source.name, createSourceIndex(source, { expectedSha256: hashes.get(source.name)! })]));
    const definitions = new Map<string, ReturnType<typeof witnessDefinition>>();
    function witnessDefinition(element: Element, sourceName: string) {
        const index = indexes.get(sourceName)!;
        const label = children(element).find(child => child.namespaceURI === TEI_NAMESPACE && child.localName === 'abbr')?.textContent?.trim();
        const kinds = children(element).filter(child => child.namespaceURI === TEI_NAMESPACE).map(child => child.localName);
        const kind = kinds.includes('msDesc') && !kinds.includes('bibl') ? 'manuscript' as const : kinds.includes('bibl') && !kinds.includes('msDesc') ? 'edition' as const : 'unspecified' as const;
        return { id: 'witness:' + JSON.stringify([sourceName, index.selector(element)]), kind, ...(label ? { label } : {}), provenance: index.provenance(element) };
    }
    for (const [sourceName, index] of indexes) {
        const header = index.root.getElementsByTagNameNS(TEI_NAMESPACE, 'teiHeader')[0];
        if (!header) continue;
        for (const witness of Array.from(header.getElementsByTagNameNS(TEI_NAMESPACE, 'witness'))) {
            const parent = witness.parentNode as Element;
            if (parent?.namespaceURI !== TEI_NAMESPACE || parent.localName !== 'listWit') continue;
            const id = witness.getAttributeNS(XML_NAMESPACE, 'id');
            if (id) definitions.set(JSON.stringify([sourceName, id]), witnessDefinition(witness, sourceName));
        }
    }
    const groups: AlternativesStudy['groups'] = [], diagnostics: AlternativesStudy['diagnostics'] = [];
    for (const marker of edition.annotations.filter(annotation => annotation.kind === 'uncompiled-content')) {
        const index = indexes.get(marker.provenance.source)!;
        const entry = index.resolve(marker.provenance)!;
        try {
            if (entry.namespaceURI !== TEI_NAMESPACE || entry.localName !== 'app') throw new Error('Only inline apparatus entries are covered by this experiment');
            checkAttributes(entry);
            if (Array.from(entry.childNodes).some(node => (node.nodeType === 3 || node.nodeType === 4) && node.nodeValue?.trim())) throw new Error('Unstructured text between reading candidates');
            const candidates: AlternativesStudy['groups'][number]['candidates'] = [], notes: AlternativesStudy['groups'][number]['notes'] = [];
            for (const child of children(entry)) {
                if (child.namespaceURI !== TEI_NAMESPACE) throw new Error('Foreign content in apparatus entry');
                const provenance = index.provenance(child);
                const id = marker.id + ':study:' + index.selector(child);
                if (child.localName === 'note') { notes.push({ id, content: compileContent(child, id, index), provenance, ...evidence(child) }); continue; }
                if (!['lem', 'rdg'].includes(child.localName)) throw new Error('Grouped or unsupported reading structure');
                const witnessIds = words(value(child, 'wit')).map(ref => {
                    if (!ref.startsWith('#') || ref.length < 2) throw new Error('Witness references must identify an explicitly supplied local declaration');
                    const definition = definitions.get(JSON.stringify([marker.provenance.source, decodeURIComponent(ref.slice(1))]));
                    if (!definition) throw new Error('Unresolved witness declaration ' + ref);
                    return definition.id;
                });
                candidates.push({ id, role: child.localName === 'lem' ? 'editorial-base' : 'variant', content: compileContent(child, id, index, true), witnessIds: [...new Set(witnessIds)], provenance, ...evidence(child) });
            }
            if (candidates.length < 2 || candidates.filter(candidate => candidate.role === 'editorial-base').length > 1) throw new Error('Expected two or more candidates and at most one editorial base');
            groups.push({ id: marker.id + ':study', markerId: marker.id, candidates, notes, provenance: marker.provenance, ...evidence(entry) });
        } catch (error) {
            diagnostics.push({ markerId: marker.id, code: 'unsupported-alternative-entry', message: error instanceof Error ? error.message : String(error), provenance: marker.provenance });
        }
    }
    const used = new Set(groups.flatMap(group => group.candidates.flatMap(candidate => candidate.witnessIds)));
    return verifyAlternativesStudy(edition, { version: '0.2', editionSha256: manifest.editionSha256, witnesses: [...definitions.values()].filter(witness => used.has(witness.id)), groups, diagnostics });
}

/** Bind the experiment to its exact base artifact and account for every quarantined marker. */
export function verifyAlternativesStudy(edition: Edition, input: unknown): AlternativesStudy {
    const study = AlternativesStudySchema.parse(input);
    if (study.editionSha256 !== fingerprintJson(edition)) throw new Error('Alternatives study does not match the edition artifact');
    assertAlternativeAnchors(edition, study);
    return study;
}
