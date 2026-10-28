import { AlternativesStudySchema, assertAlternativeAnchors, type AlternativesStudy } from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';
import type { Edition } from '@acdh-oeaw/tei-edition-ir';
import { createSourceIndex, TEI_NAMESPACE, XML_NAMESPACE } from '../source';
import { verifyCompilationManifest, verifyCompilationSources } from '../manifest';
import { fingerprintJson } from '../fingerprints';
import { compileAnnotatedText, checkTextAttributes, textEvidence as evidence } from '../annotated-text';
const words = (value: string) => value.split(/\s+/).filter(Boolean);
const value = (element: Element, name: string) => element.getAttribute(name) ?? '';

type Input = { name: string; xml: string };
const children = (element: Element) => Array.from(element.childNodes).filter((node): node is Element => node.nodeType === 1);
/** Experimental, explicit-input study. Leaves the validated v0.4 edition and its diagnostics unchanged. */
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
            if (entry.namespaceURI !== TEI_NAMESPACE || !['app', 'choice'].includes(entry.localName)) throw new Error('Only inline apparatus or abbreviation/expansion choices are covered');
            const kind = entry.localName === 'choice' ? 'abbreviation-expansion' as const : 'textual-variation' as const;
            if (kind === 'abbreviation-expansion' && (children(entry).length !== 2 || children(entry).filter(child => child.namespaceURI === TEI_NAMESPACE && child.localName === 'abbr').length !== 1 || children(entry).filter(child => child.namespaceURI === TEI_NAMESPACE && child.localName === 'expan').length !== 1)) throw new Error('Choice requires exactly one abbreviated and one expanded form');
            checkTextAttributes(entry);
            if (Array.from(entry.childNodes).some(node => (node.nodeType === 3 || node.nodeType === 4) && node.nodeValue?.trim())) throw new Error('Unstructured text between reading candidates');
            const candidates: AlternativesStudy['groups'][number]['candidates'] = [], notes: AlternativesStudy['groups'][number]['notes'] = [];
            for (const child of children(entry)) {
                if (child.namespaceURI !== TEI_NAMESPACE) throw new Error('Foreign content in apparatus entry');
                const provenance = index.provenance(child);
                const id = marker.id + ':study:' + index.selector(child);
                if (kind === 'textual-variation' && child.localName === 'note') { notes.push({ id, content: compileAnnotatedText(child, id, index), provenance, ...evidence(child) }); continue; }
                if (!(kind === 'textual-variation' ? ['lem', 'rdg'] : ['abbr', 'expan']).includes(child.localName)) throw new Error('Grouped or unsupported reading structure');
                const witnessIds = words(value(child, 'wit')).map(ref => {
                    if (!ref.startsWith('#') || ref.length < 2) throw new Error('Witness references must identify an explicitly supplied local declaration');
                    const definition = definitions.get(JSON.stringify([marker.provenance.source, decodeURIComponent(ref.slice(1))]));
                    if (!definition) throw new Error('Unresolved witness declaration ' + ref);
                    return definition.id;
                });
                candidates.push({ id, role: kind === 'abbreviation-expansion' ? child.localName === 'abbr' ? 'abbreviated-form' : 'expanded-form' : child.localName === 'lem' ? 'editorial-base' : 'variant', content: compileAnnotatedText(child, id, index, kind === 'textual-variation'), witnessIds: [...new Set(witnessIds)], provenance, ...evidence(child) });
            }
            if (candidates.length < 2 || candidates.filter(candidate => candidate.role === 'editorial-base').length > 1) throw new Error('Expected two or more candidates and at most one editorial base');
            groups.push({ id: marker.id + ':study', kind, markerId: marker.id, candidates, notes, provenance: marker.provenance, ...evidence(entry) });
        } catch (error) {
            diagnostics.push({ markerId: marker.id, code: 'unsupported-alternative-entry', message: error instanceof Error ? error.message : String(error), provenance: marker.provenance });
        }
    }
    const used = new Set(groups.flatMap(group => group.candidates.flatMap(candidate => candidate.witnessIds)));
    return verifyAlternativesStudy(edition, { version: '0.3', editionSha256: manifest.editionSha256, witnesses: [...definitions.values()].filter(witness => used.has(witness.id)), groups, diagnostics });
}

/** Bind the experiment to its exact base artifact and account for every quarantined marker. */
export function verifyAlternativesStudy(edition: Edition, input: unknown): AlternativesStudy {
    const study = AlternativesStudySchema.parse(input);
    if (study.editionSha256 !== fingerprintJson(edition)) throw new Error('Alternatives study does not match the edition artifact');
    assertAlternativeAnchors(edition, study);
    return study;
}
