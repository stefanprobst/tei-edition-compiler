import { compileAnnotatedText } from './annotated-text';
import { MappingSchema, audenMusulinMapping, ownEntry, type Mapping } from './mapping';
export { MappingSchema, MappingProfileSchema, audenMusulinMapping, type Mapping, type MappingProfile } from './mapping';
import { buildManifest } from './manifest';
export { CompilationManifestSchema, verifyCompilationManifest, verifyCompilationSources, type CompilationManifest } from './manifest';
import { annotationReference, documentUris, entityReference, referenceKey, referenceUri } from './references';
import { indexAuthorities, type AuthoritySource } from './authorities';
export type { AuthoritySource } from './authorities';
import { contributors, type Contributor } from './contributors';
import { createFacsimileIndex } from './facsimiles';
import { dateValue } from './dates';
export { dateValue } from './dates';
import { createSourceIndex, TEI_NAMESPACE as NS, XML_NAMESPACE as XML } from './source';
export { createSourceIndex } from './source';
import { EditionSchema, type Edition, type Provenance } from '@acdh-oeaw/tei-edition-ir';
const attr = (e: Element, n: string) => e.getAttribute(n) || '';
const text = (e: Element) => (e.textContent || '').replace(/\s+/g, ' ').trim();
const children = (e: Element) => Array.from(e.childNodes).filter((n): n is Element => n.nodeType === 1);
const all = (e: Element, n: string) => Array.from(e.getElementsByTagNameNS(NS, n));
const words = (s: string) => s.trim().split(/\s+/).filter(Boolean);
export interface Source {
    name: string;
    xml: string;
    /** Optional absolute identity for externally addressed source documents. */
    uri?: string;
}
export interface CompileOptions { authorities?: AuthoritySource[] }
export function compile(sources: Source[], mapping: Mapping = audenMusulinMapping, options: CompileOptions = {}): Edition {
    mapping = MappingSchema.parse(mapping);
    const out: Edition = { version: '0.3', id: 'edition', documents: [], entities: [], mentions: [], relations: [], annotations: [], resources: [], anchors: [], diagnostics: [] };
    const names = new Set<string>();
    for (const source of [...sources, ...(options.authorities ?? [])]) {
        if (names.has(source.name)) throw new Error(`Duplicate source name ${source.name}`);
        names.add(source.name);
    }
    const authorities = indexAuthorities(options.authorities ?? [], mapping, (code, message, provenance) => out.diagnostics.push({ code, message, provenance }));
    const entityMap = new Map<string, { record: Edition['entities'][number]; kinds: Set<Edition['entities'][number]['kind']> }>();
    const interpretations = new Map<string, Edition['annotations'][number]>();
    const sourceUris = new Set<string>();
    const referenceTargets = new Map<string, string>();
    const documentReferences: { relation: Edition['relations'][number]; refs: string[]; documentUri: string; hashMeansDocumentId: boolean }[] = [];
    const contributorDefinitions = new Map<string, Contributor[]>();
    const contributorsByElement = new WeakMap<Element, Contributor>();
    const sourceIndexes = new Map<string, ReturnType<typeof createSourceIndex>>();
    const attributions: { annotation: Edition['annotations'][number]; element: Element; refs: string[]; documentUri: string; document: Edition['documents'][number]; provenance: (e: Element) => Provenance }[] = [];
    const glyphs: { occurrence: Edition['annotations'][number]; refs: string[]; documentUri: string }[] = [];
    const pending: { link: Edition['annotations'][number]; refs: string[]; documentUri: string; partId: string }[] = [];
    for (const source of sources) {
        const sourceIndex = createSourceIndex(source);
        const root = sourceIndex.root;
        const docId = root.getAttributeNS(XML, 'id') || source.name;
        if (out.documents.some(d => d.id === docId))
            throw new Error(`Duplicate source ID ${docId}`);
        const uris = documentUris(source.name, docId, source.uri, mapping);
        for (const uri of uris.aliases) {
            if (sourceUris.has(uri)) throw new Error(`Ambiguous source URI ${uri}`);
            sourceUris.add(uri);
            sourceIndexes.set(uri, sourceIndex);
            referenceTargets.set(uri, docId);
            const rootId = root.getAttributeNS(XML, 'id');
            if (rootId) referenceTargets.set(referenceUri(`#${encodeURIComponent(rootId)}`, uri, mapping)!.href, docId);
        }
        const selector = sourceIndex.selector;
        const prov = sourceIndex.provenance;
        const readDate = (e: Element) => dateValue(e, (code, message) => out.diagnostics.push({ code, message, provenance: prov(e) }));
        const id = (e: Element, suffix = '') => `${docId}:${selector(e)}${suffix}`;
        const header = all(root, 'teiHeader')[0];
        if (!header)
            throw new Error('Missing document header');
        for (const definition of contributors(header, sourceIndex, uris.primary, mapping)) {
            contributorsByElement.set(definition.element, definition);
            const definitions = contributorDefinitions.get(definition.identity) ?? [];
            definitions.push(definition);
            contributorDefinitions.set(definition.identity, definitions);
        }
        const d: Edition['documents'][number] = { id: docId, provenance: prov(root), metadata: { title: text(all(header, 'title').find(e => attr(e, 'level') === 'a') || all(header, 'title')[0] || header), dates: [...all(header, 'origDate'), ...all(header, 'setting').flatMap(e => all(e, 'date'))].map(readDate), languages: all(header, 'language').map(e => attr(e, 'ident')), identifiers: all(header, 'idno').map(text), rights: all(header, 'availability').map(text) }, parts: [], resourceIds: [], relationIds: [], annotationIds: [] };
        out.documents.push(d);
        const entity = (ref: string, kind: Edition['entities'][number]['kind'], e: Element, bareIdentifier = false) => {
            const canonical = entityReference(ref, uris.primary, mapping, mapping.authorityDocuments?.[kind], bareIdentifier);
            const key = canonical ?? JSON.stringify([uris.primary, ref]);
            if (!canonical) out.diagnostics.push({ code: 'invalid-entity-reference', message: ref, provenance: prov(e) });
            let entry = entityMap.get(key);
            if (!entry) {
                const record: Edition['entities'][number] = { id: `entity:${key}`, kind, authorityRef: canonical ?? ref, resolution: 'external', provenance: prov(e) };
                entry = { record, kinds: new Set([kind]) };
                entityMap.set(key, entry);
                out.entities.push(record);
            } else if (!entry.kinds.has(kind)) {
                entry.kinds.add(kind);
                const knownKinds = [...entry.kinds].filter(k => k !== 'unknown');
                entry.record.kind = knownKinds.length === 1 ? knownKinds[0] : 'unknown';
                if (kind !== 'unknown' && knownKinds.length > 1)
                    out.diagnostics.push({ code: 'entity-kind-conflict', message: `${entry.record.authorityRef}: ${knownKinds.sort().join(', ')}`, provenance: prov(e) });
            }
            return entry.record.id;
        };
        const entityRefs = (e: Element) => {
            const ref = attr(e, 'ref') || attr(e, 'sameAs');
            const kind = ownEntry(mapping.entityKinds, attr(e, 'type')) || ownEntry({ persName: 'person', person: 'person', placeName: 'place', origPlace: 'place', orgName: 'organization', name: 'place' } as const, e.localName);
            return ref && kind ? [...new Set(words(ref).map(r => entity(r, kind, e, !attr(e, 'ref') && !!attr(e, 'sameAs'))))] : [];
        };
        const facsimiles = createFacsimileIndex({
            root, documentUri: uris.primary, aliases: uris.aliases, mapping, id, provenance: prov,
            report: (code, message, element) => out.diagnostics.push({ code, message, provenance: prov(element) }),
        });
        out.resources.push(...facsimiles.resources);
        d.resourceIds.push(...facsimiles.resources.map(r => r.id));
        const queueDocumentReference = (e: Element, subjectId: string, predicate = 'references', hashMeansDocumentId = false) => {
            const refs = [...new Set(words(attr(e, 'target')))];
            const record: Edition['relations'][number] = { id: id(e, ':relation'), subjectId, predicate, objectIds: [], provenance: prov(e) };
            out.relations.push(record);
            d.relationIds.push(record.id);
            documentReferences.push({ relation: record, refs, documentUri: uris.primary, hashMeansDocumentId });
            if (!refs.length) out.diagnostics.push({ code: 'empty-document-reference', message: attr(e, 'target'), provenance: prov(e) });
        };
        const annotation = (e: Element, kind: string, targetIds: string[], range?: Edition['annotations'][number]['range'], parentId?: string) => {
            const aid = id(e, `:annotation:${kind}`);
            const a: Edition['annotations'][number] = { id: aid, kind, targetIds, ...(parentId ? { parentId } : {}), provenance: prov(e), ...(range ? { range } : {}), body: kind === 'language' ? undefined : text(e) || undefined, responsibility: [...new Set([attr(e, 'resp'), ...all(e, 'respons').map(r => attr(r, 'resp'))].flatMap(words))], certainty: attr(e, 'cert') || all(e, 'certainty').map(c => attr(c, 'cert')).join(' ') || undefined, evidence: words(attr(e, 'source')).concat(all(e, 'bibl').map(b => attr(b, 'source')).filter(Boolean)), details: {} };
            const properties: Record<string, string> = { place: 'placement', rend: 'rendering', reason: 'reason', quantity: 'quantity', unit: 'unit', extent: 'extent', min: 'minimum', atMost: 'maximum', 'xml:lang': 'language', hand: 'authoringHand', target: 'destination' };
            for (const [k, v] of Object.entries(properties))
                if (attr(e, k))
                    a.details[v] = attr(e, k);
            if (e.hasAttributeNS(XML, 'lang')) a.details.language = e.getAttributeNS(XML, 'lang') ?? '';
            if (kind === 'spacing' && attr(e, 'unit') === 'char' && e.hasAttribute('quantity')) {
                const quantity = attr(e, 'quantity').trim();
                if (/^\d+$/.test(quantity) && Number.isSafeInteger(Number(quantity))) a.details.characterCount = String(Number(quantity));
                else out.diagnostics.push({ code: 'invalid-spacing-quantity', message: quantity, provenance: prov(e) });
            }
            out.annotations.push(a);
            d.annotationIds.push(aid);
            if (kind === 'glyph') {
                const refs = [...new Set(words(attr(e, 'ref')))];
                a.evidence = [...new Set([...a.evidence, ...refs])];
                glyphs.push({ occurrence: a, refs, documentUri: uris.primary });
                if (e.hasAttribute('ref') && !refs.length) out.diagnostics.push({ code: 'unresolved-glyph', message: attr(e, 'ref'), provenance: prov(e) });
            }
            if (kind === 'link' && e.hasAttribute('target')) {
                a.evidence = [...new Set([...a.evidence, ...words(attr(e, 'target'))])];
                queueDocumentReference(e, aid);
            }
            const bindings = [e, ...all(e, 'respons')];
            for (const binding of bindings) {
                const refs = [...new Set(words(attr(binding, 'resp')))];
                if (refs.length) attributions.push({ annotation: a, element: binding, refs, documentUri: uris.primary, document: d, provenance: prov });
            }
            return aid;
        };
        for (const e of all(header, 'interp')) {
            annotation(e, 'interpretation', [docId]);
            const record = out.annotations[out.annotations.length - 1];
            const fragment = e.getAttributeNS(XML, 'id');
            if (fragment) for (const uri of uris.aliases) {
                interpretations.set(referenceKey(uri, fragment), record);
                referenceTargets.set(referenceUri(`#${encodeURIComponent(fragment)}`, uri, mapping)!.href, record.id);
            }
            for (const ref of all(e, 'ref')) {
                let owner = ref.parentNode as Element | null;
                while (owner && !(owner.namespaceURI === NS && owner.localName === 'interp')) owner = owner.parentNode as Element | null;
                if (owner === e && ref.hasAttribute('target')) queueDocumentReference(ref, record.id);
            }
        }
        const relation = (e: Element, predicate: string, objects: string[], description?: string, externalTargets?: Edition['relations'][number]['externalTargets']) => { const rid = id(e, ':relation'); const dt = all(e, 'date')[0]; out.relations.push({ id: rid, subjectId: docId, predicate, objectIds: objects, description, ...(externalTargets ? { externalTargets } : {}), ...(dt ? { date: readDate(dt) } : {}), provenance: prov(e) }); d.relationIds.push(rid); };
        for (const e of all(header, 'correspAction'))
            relation(e, `correspondence:${attr(e, 'type')}`, all(e, 'rs').concat(all(e, 'persName')).flatMap(entityRefs));
        for (const e of all(header, 'person'))
            relation(e, attr(e, 'role') || 'participant', entityRefs(e), all(e, 'note').map(text).join('; '));
        for (const e of all(header, 'setting'))
            relation(e, 'setting', all(e, 'name').flatMap(entityRefs));
        for (const e of all(header, 'ref').filter(e => (e.parentNode as Element | null)?.localName === 'correspContext')) {
            const target = attr(e, 'target');
            const documentTarget = attr(e, 'type') === 'withinCollection';
            if (documentTarget) queueDocumentReference(e, docId, attr(e, 'subtype') || attr(e, 'type'), true);
            else relation(e, attr(e, 'subtype') || attr(e, 'type'), words(target).map(r => entity(r, 'person', e)));
        }
        const partKind = (e: Element) => e.namespaceURI === NS ? (e.localName === 'div' ? ownEntry(mapping.partKinds, attr(e, 'type')) : ownEntry(mapping.elementPartKinds, e.localName)) : undefined;
        const semantic = (e: Element) => !!partKind(e);
        const editorial: Record<string, string> = { add: 'insertion', del: 'deletion', unclear: 'uncertain-reading', gap: 'missing-text', space: 'spacing', hi: 'emphasis', supplied: 'supplied-text', sic: 'original-reading', corr: 'correction', subst: 'substitution', foreign: 'language', p: 'paragraph', l: 'verse-line', lg: 'stanza', head: 'heading', title: 'work-title', postscript: 'postscript', g: 'glyph', addrLine: 'address-line', quote: 'quotation', stamp: 'stamp', ref: 'link' };
        const blocks = new Set(['p', 'l', 'lg', 'opener', 'closer', 'ab', 'address', 'dateline', 'salute', 'signed', 'head', 'addrLine', 'postscript']);
        let nextOrder = 0;
        const compilePart = (e: Element, parentId?: string, parentOffset?: number, containingAnnotationId?: string) => {
            const p: Edition['documents'][number]['parts'][number] = { id: id(e), kind: partKind(e)!, order: nextOrder++, ...(parentId ? { parentId, parentOffset } : {}), resourceIds: [], provenance: prov(e) };
            d.parts.push(p);
            if (containingAnnotationId) {
                const relationId = `${p.id}:contains-part`;
                out.relations.push({ id: relationId, subjectId: containingAnnotationId, predicate: 'contains-part', objectIds: [p.id], provenance: prov(e) });
                d.relationIds.push(relationId);
            }
            const fragment = e.getAttributeNS(XML, 'id');
            if (fragment) for (const uri of uris.aliases) referenceTargets.set(referenceUri(`#${encodeURIComponent(fragment)}`, uri, mapping)!.href, p.id);
            let content = '';
            const walk = (n: Node, parentAnnotationId?: string, languageDepth = 0) => {
                if (n.nodeType === 3 || n.nodeType === 4) {
                    const raw = n.nodeValue || '';
                    if (!raw.trim() && /[\r\n]/.test(raw))
                        return;
                    content += raw.replace(/\s+/g, ' ');
                    return;
                }
                if (n.nodeType !== 1)
                    return;
                const el = n as Element;
                if (el.namespaceURI !== NS) {
                    out.diagnostics.push({ code: 'foreign-element', message: 'Foreign content omitted', provenance: prov(el) });
                    return;
                }
                if (semantic(el) && el !== e) {
                    compilePart(el, p.id, content.length, parentAnnotationId);
                    return;
                }
                if (el.localName === 'pb') {
                    const resources = facsimiles.resolve(el);
                    out.anchors.push({ id: id(el), partId: p.id, order: nextOrder++, offset: content.length, resourceIds: resources, label: attr(el, 'ed') || attr(el, 'n') || undefined, provenance: prov(el) });
                    p.resourceIds.push(...resources);
                    return;
                }
                if (el.localName === 'lb') {
                    if (attr(el, 'break') === 'no') annotation(el, 'line-continuation', [p.id], { partId: p.id, start: content.length, end: content.length }, parentAnnotationId);
                    else content += '\n';
                    return;
                }
                if (el.localName === 'note') {
                    annotation(el, 'note', [p.id], { partId: p.id, start: content.length, end: content.length }, parentAnnotationId);
                    const note = out.annotations[out.annotations.length - 1];
                    for (const [attribute, key] of Object.entries({ type: 'classification', subtype: 'subclassification', n: 'label' })) if (el.hasAttribute(attribute)) note.details[key] = attr(el, attribute);
                    delete note.body;
                    try {
                        note.content = compileAnnotatedText(el, note.id, sourceIndex, false, ['place', 'n']);
                        note.details.contentStatus = 'compiled';
                    } catch {
                        note.details.contentStatus = 'uncompiled';
                        out.diagnostics.push({ code: 'unsupported-note-content', message: 'Note body or attachment remains uncompiled; inspect the canonical source', provenance: prov(el) });
                    }
                    return;
                }
                if (el.localName === 'app' || el.localName === 'choice') {
                    const start = content.length;
                    content += '\uFFFC';
                    annotation(el, 'uncompiled-content', [p.id], { partId: p.id, start, end: content.length }, parentAnnotationId);
                    const marker = out.annotations[out.annotations.length - 1];
                    delete marker.body;
                    marker.details.feature = el.localName === 'app' ? 'textual-apparatus' : 'text-alternatives';
                    out.diagnostics.push({ code: el.localName === 'app' ? 'unsupported-textual-apparatus' : 'unsupported-text-alternatives', message: 'Uncompiled entry replaced by a source-backed marker; no reading selected', provenance: prov(el) });
                    return;
                }
                const transparent = new Set(['body', 'div', 'rs', 'persName', 'placeName', 'orgName', 'name', 'ab', 'opener', 'closer', 'address', 'dateline', 'salute', 'signed', 'date', 'seg', 'fw']);
                if (!transparent.has(el.localName) && !editorial[el.localName])
                    out.diagnostics.push({ code: 'unmapped-content', message: `Content element ${el.localName} traversed without a semantic mapping`, provenance: prov(el) });
                const start = content.length;
                const hasLanguage = el.hasAttributeNS(XML, 'lang');
                const nextLanguageDepth = languageDepth + (hasLanguage ? 1 : 0);
                const annotationKind = editorial[el.localName];
                const annotationId = annotationKind ? id(el, `:annotation:${annotationKind}`) : hasLanguage ? id(el, ':annotation:language') : parentAnnotationId;
                if (el.localName === 'gap' || el.localName === 'space')
                    content += '\uFFFC';
                else
                    for (const child of Array.from(el.childNodes))
                        walk(child, annotationId, nextLanguageDepth);
                if (el.localName === 'g' && content.length === start) {
                    content += '\uFFFC';
                    out.diagnostics.push({ code: 'unrendered-glyph', message: 'Glyph has no supplied literal reading', provenance: prov(el) });
                }
                const range = { partId: p.id, start, end: content.length };
                const refs = entityRefs(el);
                if (el.localName === 'rs' && attr(el, 'ref') && !refs.length)
                    out.diagnostics.push({ code: 'unmapped-entity', message: `Unmapped entity category ${attr(el, 'type')}`, provenance: prov(el) });
                if (refs.length)
                    out.mentions.push({ id: id(el, ':mention'), entityIds: refs, range, label: content.slice(start), provenance: prov(el) });
                if (editorial[el.localName]) {
                    annotation(el, editorial[el.localName], [p.id], { ...range }, parentAnnotationId);
                    if (annotationKind !== 'language' && all(el, 'note').length) out.annotations[out.annotations.length - 1].body = content.slice(start, range.end) || undefined;
                }
                let languageAnnotation: Edition['annotations'][number] | undefined;
                if (hasLanguage) {
                    if (annotationKind !== 'language') annotation(el, 'language', [p.id], { ...range }, parentAnnotationId);
                    languageAnnotation = out.annotations.find(a => a.id === id(el, ':annotation:language'));
                    if (languageAnnotation) {
                        languageAnnotation.details.scope = 'span';
                        languageAnnotation.details.depth = String(nextLanguageDepth);
                    }
                }
                const interpretationRefs = [...new Set(words(attr(el, 'ana')))];
                if (interpretationRefs.length) {
                    annotation(el, 'interpretation-link', [], range);
                    const link = out.annotations[out.annotations.length - 1];
                    link.evidence = [...new Set([...link.evidence, ...interpretationRefs])];
                    pending.push({ link, refs: interpretationRefs, documentUri: uris.primary, partId: p.id });
                }
                let next = el.nextSibling;
                if (el.localName === 'addrLine') while (next && next.nodeType !== 1 && ((next.nodeType !== 3 && next.nodeType !== 4) || !(next.nodeValue ?? '').trim())) next = next.nextSibling;
                const explicitAddressBreak = el.localName === 'addrLine' && next?.nodeType === 1 && (next as Element).namespaceURI === NS && (next as Element).localName === 'lb';
                if (blocks.has(el.localName) && !explicitAddressBreak && content && !content.endsWith('\n'))
                    content += '\n';
                if (languageAnnotation?.range) languageAnnotation.range.end = content.length;
            };
            for (const c of Array.from(e.childNodes))
                walk(c);
            if (content.length)
                p.content = { kind: 'text', text: content };
            let declaration: Element | null = e;
            while (declaration && !declaration.hasAttributeNS(XML, 'lang')) declaration = declaration.parentNode?.nodeType === 1 ? declaration.parentNode as Element : null;
            if (declaration) {
                annotation(e, 'language', [p.id], { partId: p.id, start: 0, end: content.length });
                const language = out.annotations[out.annotations.length - 1];
                language.provenance = prov(declaration);
                language.details.language = declaration.getAttributeNS(XML, 'lang') ?? '';
                language.details.scope = 'part';
                language.details.depth = '0';
            }
            p.resourceIds = [...new Set(p.resourceIds)];
        };
        const body = all(root, 'body')[0];
        if (body) {
            const visit = (e: Element) => {
                if (semantic(e)) { compilePart(e); return; }
                if (Array.from(e.childNodes).some(n => (n.nodeType === 3 || n.nodeType === 4) && n.nodeValue?.trim()) || e.localName === 'pb')
                    out.diagnostics.push({ code: 'unassigned-content', message: 'Content outside any mapped part was omitted', provenance: prov(e) });
                children(e).forEach(visit);
            };
            visit(body);
        }
    }
    const glyphDefinitions = new Map<Element, Edition['annotations'][number]>();
    for (const { occurrence, refs, documentUri } of glyphs) for (const ref of refs) {
        const pointer = annotationReference(ref, documentUri, mapping);
        const index = pointer && sourceIndexes.get(pointer.source);
        const definition = index && pointer && index.resolve(pointer.selector);
        const parent = definition?.parentNode as Element | null | undefined;
        if (!definition || !index || definition.namespaceURI !== NS || !['glyph', 'char'].includes(definition.localName) || parent?.namespaceURI !== NS || parent.localName !== 'charDecl') {
            out.diagnostics.push({ code: 'unresolved-glyph', message: ref, provenance: occurrence.provenance });
            if (pointer) {
                occurrence.externalTargets ??= [];
                if (!occurrence.externalTargets.some(t => t.source === pointer.source && t.selector === pointer.selector)) occurrence.externalTargets.push({ kind: 'annotation', source: pointer.source, selector: pointer.selector });
            }
            continue;
        }
        let record = glyphDefinitions.get(definition);
        if (!record) {
            const provenance = index.provenance(definition);
            const owner = out.documents.find(d => d.provenance.source === provenance.source)!;
            const body = [...all(definition, 'desc'), ...all(definition, 'charName')].map(text).filter(Boolean).join(' ');
            if (!body) out.diagnostics.push({ code: 'unmapped-glyph-definition', message: ref, provenance });
            record = { id: owner.id + ':' + index.selector(definition) + ':annotation:glyph-description', kind: 'glyph-description', targetIds: [], body: body || undefined, responsibility: [], evidence: [], details: {}, provenance };
            glyphDefinitions.set(definition, record);
            out.annotations.push(record);
            owner.annotationIds.push(record.id);
        }
        if (!record.targetIds.includes(occurrence.id)) record.targetIds.push(occurrence.id);
    }
    for (const { relation, refs, documentUri, hashMeansDocumentId } of documentReferences) {
        for (const raw of refs) {
            const ref = hashMeansDocumentId && raw.startsWith('#') ? raw.slice(1) : raw;
            const uri = ref ? referenceUri(ref, documentUri, mapping) : undefined;
            const target = uri && referenceTargets.get(uri.href);
            if (target) {
                if (!relation.objectIds.includes(target)) relation.objectIds.push(target);
            } else {
                relation.externalTargets ??= [];
                const sourceId = uri?.href ?? raw;
                if (!relation.externalTargets.some(t => t.sourceId === sourceId)) relation.externalTargets.push({ kind: 'document', sourceId });
                if (!uri) out.diagnostics.push({ code: 'invalid-document-reference', message: raw, provenance: relation.provenance });
                else if (uri.hash) {
                    const source = new URL(uri.href); source.hash = '';
                    if (sourceUris.has(source.href)) out.diagnostics.push({ code: 'unresolved-document-fragment', message: raw, provenance: relation.provenance });
                }
            }
        }
    }
    // Resolve only after every supplied source has registered its interpretations.
    for (const { link, refs, documentUri, partId } of pending) {
        for (const ref of refs) {
            const target = annotationReference(ref, documentUri, mapping);
            const interpretation = target && interpretations.get(referenceKey(target.source, target.fragment));
            if (interpretation) {
                if (!link.targetIds.includes(interpretation.id)) link.targetIds.push(interpretation.id);
                if (!interpretation.targetIds.includes(partId)) interpretation.targetIds.push(partId);
            } else {
                if (target) {
                    link.externalTargets ??= [];
                    const { source, selector } = target;
                    if (!link.externalTargets.some(t => t.source === source && t.selector === selector))
                        link.externalTargets.push({ kind: 'annotation', source, selector });
                }
                out.diagnostics.push({ code: 'unresolved-interpretation', message: ref, provenance: link.provenance });
            }
        }
    }
    for (const attribution of attributions) {
        const resolved = new Set<string>();
        for (const raw of attribution.refs) {
            const ref = /^[A-Za-z_][\w.-]*$/.test(raw) ? `#${raw}` : raw;
            const pointer = annotationReference(ref, attribution.documentUri, mapping);
            let definition: Pick<Contributor, 'identity' | 'label' | 'provenance'> | undefined;
            if (pointer) {
                const element = sourceIndexes.get(pointer.source)?.resolve(pointer.selector);
                if (element) definition = contributorsByElement.get(element);
            } else {
                const uri = entityReference(ref, attribution.documentUri, mapping);
                if (uri) definition = contributorDefinitions.get(uri)?.[0];
            }
            if (!definition) {
                const uri = entityReference(ref, attribution.documentUri, mapping);
                const authority = uri && authorities.get(uri);
                if (uri && authority && authority.kind === 'person') definition = { identity: uri, label: authority.label, provenance: authority.provenance };
            }
            if (!definition) {
                out.diagnostics.push({ code: 'unresolved-responsibility', message: raw, provenance: attribution.provenance(attribution.element) });
                continue;
            }
            if (resolved.has(definition.identity)) continue;
            resolved.add(definition.identity);
            let entry = entityMap.get(definition.identity);
            if (!entry) {
                const record: Edition['entities'][number] = { id: `entity:${definition.identity}`, kind: 'person', authorityRef: definition.identity, resolution: 'external', provenance: definition.provenance };
                entry = { record, kinds: new Set(['person']) };
                entityMap.set(definition.identity, entry);
                out.entities.push(record);
            } else if ([...entry.kinds].some(kind => kind !== 'person' && kind !== 'unknown')) {
                entry.record.kind = 'unknown';
                out.diagnostics.push({ code: 'contributor-kind-conflict', message: definition.identity, provenance: definition.provenance });
            } else entry.record.kind = 'person';
            entry.kinds.add('person');
            const labels = [...new Set((contributorDefinitions.get(definition.identity) ?? []).map(d => d.label).filter((label): label is string => !!label))];
            if (labels.length === 1) entry.record.label = labels[0];
            else if (labels.length > 1) {
                delete entry.record.label;
                out.diagnostics.push({ code: 'contributor-label-conflict', message: `${definition.identity}: ${labels.join(' | ')}`, provenance: definition.provenance });
            }
            entry.record.provenance = definition.provenance;
            const relationId = `${attribution.annotation.id}:responsible:${entry.record.id}`;
            if (!out.relations.some(r => r.id === relationId)) {
                out.relations.push({ id: relationId, subjectId: entry.record.id, predicate: 'responsible-for', objectIds: [attribution.annotation.id], provenance: attribution.provenance(attribution.element) });
                attribution.document.relationIds.push(relationId);
            }
        }
    }
    for (const entity of out.entities) {
        const authority = authorities.get(entity.authorityRef);
        if (!authority) continue;
        const entry = entityMap.get(entity.authorityRef)!;
        const known = [...entry.kinds].filter(kind => kind !== 'unknown');
        if (known.some(kind => kind !== authority.kind)) {
            entity.kind = 'unknown';
            out.diagnostics.push({ code: 'authority-kind-conflict', message: `${entity.authorityRef}: occurrence ${known.sort().join(', ')}; authority ${authority.kind}`, provenance: authority.provenance });
        } else entity.kind = authority.kind;
        entity.provenance = authority.provenance;
        if (authority.label !== undefined) entity.label = authority.label;
    }
    return EditionSchema.parse(out);
}

/** Compile the same IR, with a separate deterministic record of its supplied inputs. */
export function compileWithManifest(sources: Source[], mapping: Mapping = audenMusulinMapping, options: CompileOptions = {}) {
    const edition = compile(sources, mapping, options);
    return { edition, manifest: buildManifest(edition, sources, mapping, options) };
}
