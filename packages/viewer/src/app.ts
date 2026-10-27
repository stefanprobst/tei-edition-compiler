import { readArtifactFiles, validateArtifactSet } from './artifacts';
import { EditionSchema, documentEvents, entityDisplayName, type Edition, type Provenance } from '@acdh-oeaw/tei-edition-ir';
import { remoteUrl, textSegments, partLabels, alternativeGroupsForDocument } from './model';
import { type AlternativesStudy } from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';
import { alternativesPanel } from './alternatives-panel';
import { renderAnnotatedText, annotatedTextEvidence } from './annotated-text';
import type { AnnotatedText } from '@acdh-oeaw/tei-edition-ir';
import { readerHash, readReaderHash } from './navigation';

type Presentation = { attribution: string; sourceLinks: Record<string, string>; previews: Record<string, string> };
type RecordValue = { id: string; provenance: Provenance; [key: string]: unknown };
const navigation = document.querySelector<HTMLElement>('#navigation')!;
const main = document.querySelector<HTMLElement>('#main')!;
const inspector = document.querySelector<HTMLElement>('#inspector')!;
const status = document.querySelector<HTMLElement>('#status')!;
let edition: Edition;
let inputGeneration = 0;
let artifactStatus = 'Edition schema validated; artifact binding not checked';
let presentation: Presentation = { attribution: '', sourceLinks: {}, previews: {} };
let activeStudy: AlternativesStudy | undefined;
let readingSelections = new Map<string, string>();
let candidateDeletionText: 'retain' | 'omit' = 'retain';
let selectedDocument = '';
let activeRecordIds: string[] = [];
type HistoryMode = 'push' | 'replace' | 'none';
function recordNavigation(recordIds: string[], mode: HistoryMode, partId?: string) {
    activeRecordIds = recordIds;
    if (mode === 'none') return;
    const localGroups = activeStudy ? alternativeGroupsForDocument(edition, activeStudy, selectedDocument) : [];
    const choices = localGroups.filter(group => readingSelections.has(group.id)).map(group => ({ groupId: group.id, candidateId: readingSelections.get(group.id)! }));
    const hash = readerHash({ documentId: selectedDocument, recordIds, partId, ...(activeStudy ? { choices, candidateDeletionText } : {}) });
    if (location.hash === hash) return;
    if (mode === 'replace') history.replaceState(null, '', hash);
    else history.pushState(null, '', hash);
}
function restoreNavigation() {
    if (!edition?.documents.length) return;
    const route = readReaderHash(location.hash);
    const documentId = edition.documents.some(document => document.id === route?.documentId) ? route!.documentId : edition.documents[0].id;
    readingSelections = new Map();
    candidateDeletionText = route?.candidateDeletionText ?? 'retain';
    const localGroups = activeStudy ? alternativeGroupsForDocument(edition, activeStudy, documentId) : [];
    const duplicates = new Set((route?.choices ?? []).filter((choice, index, values) => values.findIndex(other => other.groupId === choice.groupId) !== index).map(choice => choice.groupId));
    for (const choice of route?.choices ?? []) if (!duplicates.has(choice.groupId) && localGroups.some(group => group.id === choice.groupId && group.candidates.some(candidate => candidate.id === choice.candidateId))) readingSelections.set(choice.groupId, choice.candidateId);
    showDocument(documentId, 'none');
    const ids = [...new Set(route?.recordIds ?? [])].filter(id => records.has(id));
    if (ids.length) inspectChoices(ids, 'none');
    if (route?.partId && partElements.has(route.partId)) {
        const range = ids.length === 1 ? records.get(ids[0])?.range as { partId: string; start: number; end: number } | undefined : undefined;
        if (range?.partId === route.partId) highlightRange(range, true);
        else { const part = partElements.get(route.partId)!; const disclosure = part.closest<HTMLDetailsElement>('details'); if (disclosure) disclosure.open = true; part.scrollIntoView(); }
    }
}
window.addEventListener('popstate', restoreNavigation);
let records = new Map<string, RecordValue>();
let partElements = new Map<string, HTMLElement>();
let labels = new Map<string, string>();
const human = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_:]/g, ' ');
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, className?: string): HTMLElementTagNameMap[K] {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
}
function button(text: string, action: () => void, className?: string) {
    const element = node('button', text, className); element.type = 'button'; element.onclick = action; return element;
}
function link(label: string, uri: string) {
    const safe = remoteUrl(uri);
    if (!safe) return node('span', label + ' (unsupported link)');
    const element = node('a', label); element.href = safe; element.target = '_blank'; element.rel = 'noopener noreferrer'; return element;
}
function recordLabel(id: string) {
    const record = records.get(id);
    if (!record) return id;
    if (labels.has(id)) return labels.get(id)!;
    if (typeof record.label === 'string') return record.label;
    if ('authorityRef' in record) { const display = entityDisplayName(edition, id); return display.label + (display.source === 'text' ? ' (as written)' : ''); }
    if (typeof record.role === 'string') return human(record.role);
    if ('predicate' in record) return human(String(record.predicate));
    if ('metadata' in record) return (record.metadata as Edition['documents'][number]['metadata']).title;
    return human(String(record.kind ?? 'Record'));
}
function reference(id: string) { return button(recordLabel(id), () => inspect(id), 'record-link'); }
function provenance(value: Provenance) {
    const details = node('details', undefined, 'provenance'); details.append(node('summary', 'Source evidence'));
    details.append(node('p', value.source), node('code', value.selector));
    const uri = Object.hasOwn(presentation.sourceLinks, value.source) ? presentation.sourceLinks[value.source] : undefined;
    if (uri) details.append(link('Open canonical source ↗', uri));
    else details.append(node('p', 'No source link supplied for this edition.'));
    return details;
}
function media(resourceId: string) {
    const resource = edition.resources.find(resource => resource.id === resourceId);
    const figure = node('figure');
    if (!resource) return figure;
    const uri = remoteUrl(Object.hasOwn(presentation.previews, resourceId) ? presentation.previews[resourceId] : resource.uri);
    if (uri) {
        const image = node('img'); image.alt = 'Facsimile image'; image.loading = 'lazy'; image.referrerPolicy = 'no-referrer';
        const failure = node('p', 'Image could not be loaded. Try opening the image directly below.', 'image-error'); failure.hidden = true;
        image.onerror = () => { image.hidden = true; failure.hidden = false; };
        image.src = uri; figure.append(image, failure);
    } else figure.append(node('p', 'No supported image URL.'));
    const caption = node('figcaption'); if (uri) caption.append(link('Open image ↗', uri), ' · ');
    caption.append(button('Inspect resource', () => inspect(resource.id), 'record-link'));
    if (uri !== resource.uri) { const source = node('details'); source.append(node('summary', 'Recorded resource URI'), link(resource.uri, resource.uri)); caption.append(source); }
    figure.append(caption); return figure;
}
function highlightRange(range?: { partId: string; start: number; end: number }, scroll = false) {
    main.querySelectorAll('.selected-evidence').forEach(element => element.classList.remove('selected-evidence'));
    if (!range) return;
    const part = partElements.get(range.partId); if (!part) return;
    const tokens = [...part.querySelectorAll<HTMLElement>(':scope > .transcription > .text-token')].filter(token => Number(token.dataset.start) < range.end && Number(token.dataset.end) > range.start);
    for (const token of tokens) token.classList.add('selected-evidence');
    const destination = tokens[0] ?? part;
    if (!tokens.length) part.classList.add('selected-evidence');
    if (scroll) {
        const disclosure = part.closest<HTMLDetailsElement>('details'); if (disclosure) disclosure.open = true;
        destination.scrollIntoView({ behavior: 'smooth', block: 'center' });
        if (!destination.hasAttribute('tabindex')) destination.tabIndex = -1;
        destination.focus({ preventScroll: true });
    }
}
function inspect(id: string, mode: HistoryMode = 'push') {
    const record = records.get(id); if (!record) return;
    recordNavigation([id], mode);
    highlightRange(record.range as { partId: string; start: number; end: number } | undefined);
    inspector.replaceChildren(node('p', 'RECORD INSPECTOR', 'eyebrow'), node('h2', recordLabel(id)));
    if ('authorityRef' in record) {
        if (!record.label) inspector.append(node('p', 'No authority-register name was supplied for this entity. Names shown as written come from the text and may be abbreviated or have several forms.', 'notice'));
        inspector.append(link(String(record.authorityRef), String(record.authorityRef)));
    }
    if (record.content && Array.isArray((record.content as { annotations?: unknown }).annotations)) { const content = record.content as AnnotatedText; inspector.append(renderAnnotatedText(content)); const evidence = annotatedTextEvidence(content, provenance); if (evidence) inspector.append(evidence); }
    if (record.kind === 'note' && (record.details as Record<string, string>)?.contentStatus === 'uncompiled') inspector.append(node('p', 'This note body or attachment is uncompiled. Inspect the canonical source for its content.', 'notice'));
    if (record.kind === 'note' && (record.content as { text?: string })?.text === '') inspector.append(node('p', 'Empty note.'));
    if (record.body) inspector.append(node('p', String(record.body), 'body-text'));
    if (record.description) inspector.append(node('p', String(record.description)));
    if (record.certainty) inspector.append(node('p', 'Certainty: ' + record.certainty));
    if (record.date) inspector.append(node('p', 'Date: ' + (record.date as { label: string }).label));
    if (record.range) {
        const range = record.range as { partId: string; start: number; end: number };
        const part = records.get(range.partId) as unknown as Edition['documents'][number]['parts'][number];
        inspector.append(node('blockquote', part.content?.text.slice(range.start, range.end) || '(zero-width range)'));
        inspector.append(button('Go to ' + recordLabel(range.partId), () => {
            const owner = edition.documents.find(d => d.parts.some(p => p.id === range.partId));
            if (owner && owner.id !== selectedDocument) { showDocument(owner.id, 'none'); inspect(id, 'none'); }
            recordNavigation([id], 'push', range.partId);
            highlightRange(range, true);
        }, 'record-link'));
    }
    for (const key of ['parentId', 'subjectId'] as const) if (typeof record[key] === 'string') {
        inspector.append(node('h3', human(key)), reference(record[key] as string));
    }
    for (const key of ['entityIds', 'targetIds', 'objectIds', 'resourceIds', 'witnessIds'] as const) {
        const values = record[key] as string[] | undefined;
        if (values?.length) { inspector.append(node('h3', human(key.replace('Ids', '')))); for (const target of values) inspector.append(reference(target)); }
    }
    for (const key of ['candidates', 'notes'] as const) {
        const values = record[key] as { id: string }[] | undefined;
        if (values?.length) { inspector.append(node('h3', human(key))); for (const value of values) inspector.append(reference(value.id)); }
    }
    if (activeStudy && record.kind === 'uncompiled-content') {
        const group = activeStudy.groups.find(group => group.markerId === record.id);
        if (group) inspector.append(button('Choose a reading', () => {
            const target = [...main.querySelectorAll<HTMLDetailsElement>('.reading-choice')].find(element => element.dataset.groupId === group.id);
            if (target) { target.open = true; target.scrollIntoView({ behavior: 'smooth', block: 'start' }); target.querySelector('select')?.focus({ preventScroll: true }); }
        }, 'record-link'));
    }
    const externals = record.externalTargets as { source?: string; sourceId?: string; selector?: string }[] | undefined;
    if (externals?.length) {
        inspector.append(node('h3', 'External targets'));
        for (const target of externals) { const uri = target.sourceId ?? target.source ?? ''; inspector.append(link(uri, uri)); if (target.selector) inspector.append(node('code', target.selector)); }
    }
    const details = record.details as Record<string, string> | undefined;
    if (details && Object.keys(details).length) {
        const list = node('dl');
        for (const [key, value] of Object.entries(details)) list.append(node('dt', human(key)), node('dd', value));
        inspector.append(list);
    }
    const responsibility = edition.relations.filter(relation => relation.predicate === 'responsible-for' && relation.objectIds.includes(id));
    if (responsibility.length) { inspector.append(node('h3', 'Responsible contributors')); for (const relation of responsibility) inspector.append(reference(relation.subjectId)); }
    const evidence = [...((record.evidence as string[] | undefined) ?? []), ...((record.responsibility as string[] | undefined) ?? []), ...((record.responsibilityTokens as string[] | undefined) ?? []), ...((record.sourceReferences as string[] | undefined) ?? [])];
    if (evidence.length) { const detail = node('details'); detail.append(node('summary', 'Recorded evidence')); for (const value of evidence) detail.append(node('p', value)); inspector.append(detail); }
    if ('uri' in record) {
        if (record.bounds) { const bounds = record.bounds as { x: number; y: number; width: number; height: number }; inspector.append(node('p', `Recorded bounds: ${bounds.width} × ${bounds.height}, origin ${bounds.x}, ${bounds.y}`)); }
        inspector.append(media(id));
    }
    if ('offset' in record) for (const resourceId of (record.resourceIds as string[])) inspector.append(media(resourceId));
    inspector.append(provenance(record.provenance));
    const raw = node('details'); raw.append(node('summary', 'IR record'), node('pre', JSON.stringify(record, null, 2))); inspector.append(raw);
    inspector.tabIndex = -1; inspector.focus({ preventScroll: window.matchMedia('(min-width: 1051px)').matches });
}
function inspectChoices(ids: string[], mode: HistoryMode = 'push') {
    if (ids.length === 1) { inspect(ids[0], mode); return; }
    recordNavigation(ids, mode);
    highlightRange();
    inspector.replaceChildren(node('h2', 'Evidence at this position'), node('p', 'Overlapping records are preserved. Choose one to inspect.'));
    for (const id of ids) inspector.append(reference(id));
    inspector.tabIndex = -1; inspector.focus({ preventScroll: window.matchMedia('(min-width: 1051px)').matches });
}
const styledKinds = new Set(['insertion', 'deletion', 'uncertain-reading', 'missing-text', 'supplied-text', 'spacing', 'interpretation-link', 'correction', 'glyph', 'uncompiled-content']);
function showDocument(id: string, mode: HistoryMode = 'push') {
    const current = edition.documents.find(d => d.id === id)!; selectedDocument = id;
    recordNavigation([], mode);
    partElements = new Map(); main.replaceChildren(); navigation.replaceChildren(node('p', 'COLLECTION', 'eyebrow'), node('h2', 'Documents'));
    edition.documents.forEach((document, index) => {
        const item = button(`${String(index + 1).padStart(2, '0')}  ${document.metadata.title}`, () => { readingSelections.clear(); showDocument(document.id); main.focus(); }, 'document-button');
        if (document.id === id) item.setAttribute('aria-current', 'page'); navigation.append(item);
    });
    navigation.append(node('h3', 'In this document'));
    const dates = [...new Set(current.metadata.dates.map(date => date.label))];
    main.append(node('p', `DOCUMENT ${edition.documents.indexOf(current) + 1} / ${edition.documents.length}`, 'eyebrow'), node('h1', current.metadata.title));
    if (dates.length) main.append(node('p', dates.join(' · '), 'date'));
    main.append(button('Document details & provenance', () => inspect(current.id), 'record-link'));
    const details = node('details'); details.append(node('summary', 'Rights and identifiers'));
    for (const value of [...current.metadata.identifiers, ...current.metadata.rights]) details.append(node('p', value)); main.append(details);
    const relations = edition.relations.filter(relation => current.relationIds.includes(relation.id) && relation.subjectId === current.id);
    if (relations.length) {
        const section = node('section', undefined, 'context'); section.append(node('h2', 'People, setting & relationships'));
        for (const relation of relations) {
            const row = node('div', undefined, 'relation-row'); row.append(button(human(relation.predicate), () => inspect(relation.id), 'record-link'));
            if (relation.description) row.append(node('span', relation.description));
            for (const entityId of relation.objectIds) row.append(reference(entityId));
            if (relation.date) row.append(node('span', relation.date.label));
            if (relation.externalTargets?.length) row.append(node('span', 'External reference', 'muted'));
            section.append(row);
        } main.append(section);
    }
    const localPartIds = new Set(current.parts.map(part => part.id));
    const notes = edition.annotations.filter(annotation => annotation.kind === 'note' && annotation.range && localPartIds.has(annotation.range.partId));
    if (notes.length) {
        const index = node('details'); index.className = 'notes-index'; index.append(node('summary', `Notes (${notes.length})`));
        index.append(node('p', 'Notes are separate from running text. Their anchors identify source insertion points, not inferred reference ranges.'));
        for (const part of [...current.parts].sort((a, b) => a.order - b.order)) {
            const local = notes.filter(note => note.range!.partId === part.id).sort((a, b) => a.range!.start - b.range!.start);
            if (!local.length) continue;
            index.append(node('h3', recordLabel(part.id)));
            const list = node('ul');
            for (const note of local) { const item = node('li'); item.append(button((note.content?.text ?? note.body)?.trim().replace(/\s+/g, ' ').slice(0, 100) || (note.details.contentStatus === 'uncompiled' ? 'Uncompiled note' : 'Empty note'), () => inspect(note.id), 'record-link')); list.append(item); }
            index.append(list);
        }
        main.append(index);
    }
    const hasText = current.parts.some(part => part.content?.text.length);
    if (hasText && !activeStudy) main.append(node('p', 'DIPLOMATIC VIEW · Deletions retained · Source spacing', 'reading-policy'), node('p', 'Underlined: entity mention · Red strike: deletion · Green: insertion · ◇: source marker. Select marked text to inspect overlapping evidence.', 'legend'));
    else if (!hasText) main.append(node('p', 'This document has no transcribed text. Explore its image, participants and setting.', 'notice'));
    if (activeStudy) main.append(alternativesPanel(edition, activeStudy, id, { selections: readingSelections, candidateDeletionText, onChange: policy => { candidateDeletionText = policy; recordNavigation(activeRecordIds, 'push'); }, onInspect: id => inspect(id), evidence: provenance }));
    const content = node('div', undefined, 'reading');
    if (activeStudy) { const sourceView = node('details'); sourceView.className = 'diplomatic-view'; sourceView.append(node('summary', 'Source-backed diplomatic view'), node('p', 'Deletions retained · Source spacing · Uncompiled entries remain marked', 'reading-policy'), content); main.append(sourceView); }
    else main.append(content);
    const stack: HTMLElement[] = [content];
    let page = 0;
    for (const event of documentEvents(edition, id)) {
        if (event.kind === 'enter-part') {
            const part = current.parts.find(part => part.id === event.partId)!;
            const section = node('section', undefined, 'part'); section.dataset.partId = part.id;
            const depth = stack.length; const heading = node('h2', undefined, 'part-heading');
            heading.append(button(recordLabel(part.id), () => inspect(part.id), 'record-link')); section.append(heading);
            stack.at(-1)!.append(section); stack.push(section); partElements.set(part.id, section);
            const jump = button(recordLabel(part.id), () => { recordNavigation(activeRecordIds, 'push', part.id); const disclosure = section.closest<HTMLDetailsElement>('details'); if (disclosure) disclosure.open = true; section.scrollIntoView({ behavior: 'smooth', block: 'start' }); }, 'part-jump');
            jump.style.paddingLeft = `${Math.min(depth - 1, 4) * 14 + 8}px`; navigation.append(jump);
            if (!hasText) for (const resourceId of part.resourceIds) section.append(media(resourceId));
        } else if (event.kind === 'exit-part') stack.pop();
        else if (event.kind === 'anchor') {
            const anchor = edition.anchors.find(anchor => anchor.id === event.anchorId)!;
            const marker = button('Page ' + ++page + (anchor.label ? ' · ' + anchor.label : ''), () => inspect(anchor.id), 'page-marker');
            stack.at(-1)!.append(marker);
        } else {
            const text = node('div', undefined, 'transcription');
            for (const segment of textSegments(edition, event.partId, event.start, event.end)) {
                const kinds = segment.annotationIds.map(id => String(records.get(id)?.kind));
                const interactive = !!segment.text.trim() && (segment.mentionIds.length > 0 || kinds.some(kind => styledKinds.has(kind)));
                const ids = [...segment.mentionIds, ...segment.annotationIds];
                const span = node('span', segment.text.replaceAll('\uFFFC', '◇'), 'text-token');
                if (interactive) {
                    span.setAttribute('role', 'button'); span.tabIndex = 0;
                    span.onclick = () => inspectChoices(ids);
                    span.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); inspectChoices(ids); } };
                }
                for (const kind of kinds) if (styledKinds.has(kind)) span.classList.add(kind);
                if (segment.mentionIds.length) span.classList.add('mention');
                if (segment.language) span.lang = segment.language;
                span.dataset.start = String(segment.start); span.dataset.end = String(segment.end);
                if (interactive) span.title = [...new Set([...kinds.filter(kind => styledKinds.has(kind)), ...(segment.mentionIds.length ? ['entity mention'] : [])])].map(human).join(', ');
                text.append(span);
            } stack.at(-1)!.append(text);
        }
    }
    const partIds = new Set(current.parts.map(part => part.id));
    const annotations = edition.annotations.filter(annotation => current.annotationIds.includes(annotation.id) || (annotation.range && partIds.has(annotation.range.partId)));
    const annotationSection = node('section', undefined, 'annotations'); annotationSection.append(node('h2', 'Annotation index'), node('p', `${annotations.length} records, including structural and zero-width annotations.`));
    const label = node('label', 'Choose an annotation'); const select = node('select'); select.append(new Option('Select a record…', ''));
    for (const annotation of annotations) {
        const part = annotation.range ? current.parts.find(part => part.id === annotation.range!.partId) : undefined;
        const excerpt = (annotation.range ? part?.content?.text.slice(annotation.range.start, annotation.range.end) : undefined) || annotation.content?.text || annotation.body;
        select.append(new Option(`${human(annotation.kind)} · ${excerpt?.replace(/\s+/g, ' ').slice(0, 70) || '(no text range)'}`, annotation.id));
    }
    select.onchange = () => { if (select.value) inspect(select.value); }; label.append(select); annotationSection.append(label); main.append(annotationSection);
    const diagnostics = edition.diagnostics.filter(diagnostic => diagnostic.provenance.source === current.provenance.source);
    if (diagnostics.length) { const section = node(activeStudy ? 'details' : 'section'); section.append(node(activeStudy ? 'summary' : 'h2', `Compiler diagnostics (${diagnostics.length})`)); for (const diagnostic of diagnostics) section.append(node('p', diagnostic.code + ': ' + diagnostic.message), provenance(diagnostic.provenance)); main.append(section); }
    inspector.replaceChildren(node('h2', 'Explore the document'), node('p', 'Select marked text, a page marker, a participant or an annotation to inspect its evidence.'));
    status.textContent = `${edition.documents.length} documents · IR ${edition.version} · ${edition.diagnostics.length} compiler diagnostics · ${artifactStatus}`;
}
function load(input: unknown, metadata: Presentation, restore = false, study?: AlternativesStudy, verification = 'Edition schema validated; artifact binding not checked') {
    const validated = EditionSchema.parse(input);
    edition = validated; presentation = metadata; artifactStatus = verification;
    document.querySelector<HTMLElement>('#artifact-error')!.hidden = true; activeStudy = study; readingSelections = new Map(); candidateDeletionText = 'retain';
    labels = new Map(edition.documents.flatMap(document => [...partLabels(document.parts)]));
    records = new Map([...edition.documents, ...edition.documents.flatMap(d => d.parts), ...edition.entities, ...edition.mentions, ...edition.annotations, ...edition.relations, ...edition.resources, ...edition.anchors].map(record => [record.id, record as unknown as RecordValue]));
    if (activeStudy) {
        for (const document of edition.documents) alternativeGroupsForDocument(edition, activeStudy, document.id).forEach((group, index) => labels.set(group.id, `Reading ${index + 1}`));
        for (const record of [...activeStudy.witnesses, ...activeStudy.groups, ...activeStudy.groups.flatMap(group => [...group.candidates, ...group.notes])]) records.set(record.id, record as unknown as RecordValue);
        for (const group of activeStudy.groups) for (const note of group.notes) labels.set(note.id, 'Apparatus note');
    }
    document.querySelector('#attribution')!.textContent = presentation.attribution || 'Local Edition IR. Consult document rights and source provenance before reuse.';
    if (edition.documents.length) {
        if (restore) restoreNavigation();
        else showDocument(edition.documents[0].id, 'replace');
        recordNavigation(activeRecordIds, 'replace', readReaderHash(location.hash)?.partId);
    }
    else { navigation.replaceChildren(); main.replaceChildren(node('h1', 'Empty edition')); inspector.replaceChildren(); status.textContent = 'Valid edition with no documents · ' + artifactStatus; }
}
document.querySelector<HTMLInputElement>('#upload')!.onchange = async event => {
    const input = event.target as HTMLInputElement; const file = input.files?.[0]; if (!file) return;
    const generation = ++inputGeneration;
    try { const data: unknown = JSON.parse(await file.text()); if (generation === inputGeneration) load(data, { attribution: '', previews: {}, sourceLinks: {} }); }
    catch { if (generation === inputGeneration) status.textContent = 'Could not open file: expected valid Edition IR v0.3. The current edition is unchanged.'; }
    if (generation === inputGeneration) input.value = '';
};
document.querySelector<HTMLFormElement>('#artifact-form')!.onsubmit = async event => {
    event.preventDefault();
    const file = (role: string) => document.querySelector<HTMLInputElement>('#artifact-' + role)!.files?.[0];
    const editionFile = file('edition'), manifestFile = file('manifest');
    if (!editionFile || !manifestFile) return;
    const files = { edition: editionFile, manifest: manifestFile, alternatives: file('alternatives'), presentation: file('presentation') };
    const generation = ++inputGeneration;
    const error = document.querySelector<HTMLElement>('#artifact-error')!; error.hidden = true;
    status.textContent = 'Checking compiled artifacts…';
    try {
        const result = await readArtifactFiles(files);
        if (generation !== inputGeneration) return;
        load(result.edition, result.presentation, false, result.alternatives, 'Artifact binding verified; source files not inspected');
    } catch (failure) {
        if (generation !== inputGeneration) return;
        error.textContent = (failure instanceof Error ? failure.message : 'Could not validate artifacts') + '. The current edition is unchanged.';
        error.hidden = false; status.textContent = 'Artifact load failed. The current edition is unchanged.';
    }
};
const demoGeneration = inputGeneration;
try {
    const studyDemo = new URLSearchParams(location.search).get('edition') === 'study';
    const [response, metadata, manifest, studyResponse] = await Promise.all([
        fetch(studyDemo ? '/study-edition.json' : '/edition.json'),
        fetch(studyDemo ? '/study-presentation.json' : '/presentation.json'),
        fetch(studyDemo ? '/study-edition.manifest.json' : '/edition.manifest.json'),
        studyDemo ? fetch('/study.json') : Promise.resolve(undefined),
    ]);
    if (!response.ok || !metadata.ok || !manifest.ok || (studyResponse && !studyResponse.ok)) throw new Error('Missing generated data');
    const result = await validateArtifactSet({ edition: await response.json(), manifest: await manifest.json(), presentation: await metadata.json(), ...(studyResponse ? { alternatives: await studyResponse.json() } : {}) });
    if (demoGeneration === inputGeneration) load(result.edition, result.presentation, true, result.alternatives, 'Artifact binding verified; source files not inspected');
} catch { if (demoGeneration === inputGeneration) status.textContent = 'Could not load the demo. Build it with bun run viewer:build, or open a valid Edition JSON file.'; }
