import type { Edition, Provenance } from '@acdh-oeaw/tei-edition-ir';
import type { AlternativesStudy } from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';
import { projectDocumentAlternatives, type DocumentAlternativesProjection } from '@acdh-oeaw/tei-edition-ir/experimental/document-alternatives';
import { alternativeGroupsForDocument } from './model';

type Content = AlternativesStudy['groups'][number]['candidates'][number]['content'];
const human = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) {
    const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result;
}
export function renderAlternativeContent(content: Content) {
    const output = element('div'); output.className = 'candidate-text';
    if (content.language !== undefined) output.lang = content.language;
    const annotations = new Map(content.annotations.map(annotation => [annotation.id, annotation]));
    const depth = (id: string) => { let count = 0; let current = annotations.get(id); while (current?.parentId) { count++; current = annotations.get(current.parentId); } return count; };
    const points = [...new Set([0, content.text.length, ...content.annotations.flatMap(annotation => [annotation.range.start, annotation.range.end])])].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
        const start = points[i], end = points[i + 1];
        const covering = content.annotations.filter(annotation => annotation.range.start <= start && annotation.range.end >= end);
        const span = element('span', content.text.slice(start, end).replaceAll('\uFFFC', '◇')); span.className = 'text-token';
        for (const annotation of covering) span.classList.add(annotation.kind);
        const languages = covering.filter(annotation => annotation.kind === 'language').sort((a, b) => depth(b.id) - depth(a.id) || (a.range.end - a.range.start) - (b.range.end - b.range.start));
        if (languages.length) {
            const first = languages[0];
            const tied = languages.filter(annotation => depth(annotation.id) === depth(first.id) && annotation.range.end - annotation.range.start === first.range.end - first.range.start);
            span.lang = new Set(tied.map(annotation => annotation.language ?? '')).size === 1 ? first.language ?? '' : '';
        }
        if (covering.length) span.title = [...new Set(covering.map(annotation => human(annotation.kind)))].join(', ');
        output.append(span);
    }
    return output;
}

export function alternativesPanel(edition: Edition, study: AlternativesStudy, documentId: string, options: {
    selections: Map<string, string>; candidateDeletionText: 'retain' | 'omit';
    onChange: (policy: 'retain' | 'omit') => void; onInspect: (id: string) => void;
    evidence: (provenance: Provenance) => HTMLElement;
}) {
    const groups = alternativeGroupsForDocument(edition, study, documentId);
    const section = element('section'); section.className = 'alternatives-panel'; section.id = 'reading-choices';
    section.append(element('h2', 'Reading choices'), element('p', 'Experimental preview. Choose each reading explicitly. Other scholarly structures remain unsupported; this is not a publication reading.'));
    const policyLabel = element('label', 'Candidate deletions'); const policy = element('select'); policy.id = 'candidate-deletions';
    policy.append(new Option('Retain deleted source text', 'retain'), new Option('Omit deleted source text', 'omit')); policy.value = options.candidateDeletionText; policyLabel.append(policy); section.append(policyLabel);
    const preview = element('details'); preview.className = 'selected-preview'; preview.open = true;
    preview.append(element('summary', 'Selected-text preview'));
    const status = element('p', 'Verifying and projecting…'); status.id = 'projection-status'; status.setAttribute('role', 'status');
    const previewText = element('div'); previewText.className = 'preview-text';
    const previewIssues = element('details'); previewIssues.append(element('summary', 'Projection issues')); const issueList = element('ul'); previewIssues.append(issueList);
    preview.append(status, previewIssues, previewText); section.append(preview);
    let generation = 0;
    let latestProjection: DocumentAlternativesProjection | undefined;
    const showChoice = (groupId: string) => {
        const choice = latestProjection?.choices.find(choice => choice.groupId === groupId);
        if (!choice || choice.status !== 'applied') return;
        preview.open = true;
        const spans = [...previewText.children] as HTMLElement[];
        const target = spans.find(span => span.dataset.groupId === groupId) ?? spans.find(span => Number(span.dataset.outputStart) >= choice.range.start) ?? spans.at(-1);
        target?.scrollIntoView({ block: 'nearest' });
        previewText.tabIndex = -1; previewText.focus({ preventScroll: true });
    };
    const refresh = async () => {
        const current = ++generation;
        status.textContent = 'Verifying and projecting…'; latestProjection = undefined; previewText.replaceChildren(); previewText.setAttribute('aria-busy', 'true');
        section.querySelectorAll<HTMLButtonElement>('.preview-jump').forEach(button => { button.disabled = true; });
        try {
            const selections = groups.filter(group => options.selections.has(group.id)).map(group => ({ groupId: group.id, candidateId: options.selections.get(group.id)! }));
            const projection = await projectDocumentAlternatives(edition, study, documentId, selections, { deletionText: 'retain', candidateDeletionText: policy.value as 'retain' | 'omit' });
            if (current !== generation || !section.isConnected) return;
            status.textContent = `${projection.choices.length} of ${groups.length} readings selected · ${projection.issues.length} projection issues · ${edition.diagnostics.filter(diagnostic => diagnostic.provenance.source === edition.documents.find(document => document.id === documentId)!.provenance.source).length} compiler diagnostics remain`;
            latestProjection = projection; previewText.setAttribute('aria-busy', 'false');
            previewText.replaceChildren(); issueList.replaceChildren();
            for (const run of projection.runs) {
                const span = element('span', projection.text.slice(run.start, run.end).replaceAll('\uFFFC', '◇')); span.dataset.outputStart = String(run.start);
                if (run.source.kind === 'candidate') {
                    span.dataset.groupId = run.source.groupId;
                    const id = run.source.candidateId; span.className = 'selected-candidate'; span.setAttribute('role', 'button'); span.tabIndex = 0;
                    span.title = 'Inspect selected candidate'; span.onclick = () => options.onInspect(id);
                    span.onkeydown = event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); options.onInspect(id); } };
                }
                previewText.append(span);
            }
            section.querySelectorAll<HTMLButtonElement>('.preview-jump').forEach(button => { button.disabled = !projection.choices.some(choice => choice.groupId === button.dataset.groupId && choice.status === 'applied'); });
            for (const issue of projection.issues) issueList.append(element('li', human(issue.code)));
        } catch {
            if (current === generation && section.isConnected) { previewText.setAttribute('aria-busy', 'false'); status.textContent = 'Could not verify this reading preview. No projected text is shown.'; previewText.replaceChildren(); }
        }
    };
    policy.onchange = () => { options.onChange(policy.value as 'retain' | 'omit'); void refresh(); };
    const witnesses = new Map(study.witnesses.map(witness => [witness.id, witness]));
    groups.forEach((group, index) => {
        const details = element('details'); details.className = 'reading-choice'; details.dataset.groupId = group.id; details.open = options.selections.has(group.id);
        const summary = element('summary');
        const updateSummary = () => { summary.textContent = `Reading ${index + 1} · ${options.selections.has(group.id) ? 'candidate selected' : 'no candidate selected'}`; };
        updateSummary(); details.append(summary);
        const label = element('label', `Reading ${index + 1}`), select = element('select'); select.className = 'candidate-choice'; select.dataset.groupId = group.id;
        select.append(new Option('No selection — retain source marker', ''));
        for (const candidate of group.candidates) {
            const names = candidate.witnessIds.map(id => { const witness = witnesses.get(id)!; return `${witness.label ?? 'Unlabelled'} (${witness.kind})`; }).join(', ') || 'no witness assertion';
            select.append(new Option(`${human(candidate.role)} · ${names} · ${candidate.content.text ? candidate.content.text.replaceAll('\uFFFC', '◇').slice(0, 75) : '(empty reading)'}`, candidate.id));
            const card = element('article'); card.className = 'candidate-card';
            card.append(element('h3', `${human(candidate.role)} · ${names}`), renderAlternativeContent(candidate.content));
            const inspect = element('button', 'Inspect candidate'); inspect.type = 'button'; inspect.className = 'record-link'; inspect.onclick = () => options.onInspect(candidate.id); card.append(inspect);
            if (candidate.content.annotations.length) {
                const annotations = element('details'); annotations.append(element('summary', `Interventions (${candidate.content.annotations.length})`));
                for (const annotation of candidate.content.annotations) {
                    annotations.append(element('p', `${human(annotation.kind)}: ${candidate.content.text.slice(annotation.range.start, annotation.range.end).replaceAll('\uFFFC', '◇') || '(zero width)'}`));
                    if (annotation.certainty) annotations.append(element('p', 'Certainty: ' + annotation.certainty));
                    for (const [key, value] of Object.entries(annotation.details)) annotations.append(element('p', human(key) + ': ' + value));
                    if (annotation.kind === 'language') annotations.append(element('p', 'Language: ' + (annotation.language || 'unknown')));
                    annotations.append(options.evidence(annotation.provenance));
                }
                card.append(annotations);
            }
            details.append(card);
        }
        select.value = options.selections.get(group.id) ?? '';
        select.onchange = () => { if (select.value) options.selections.set(group.id, select.value); else options.selections.delete(group.id); updateSummary(); options.onChange(policy.value as 'retain' | 'omit'); void refresh(); };
        label.append(select); details.insertBefore(label, details.children[1] ?? null);
        const jump = element('button', 'Show choice in preview'); jump.type = 'button'; jump.className = 'record-link preview-jump'; jump.dataset.groupId = group.id; jump.disabled = true; jump.onclick = () => showChoice(group.id); details.insertBefore(jump, label.nextSibling);
        for (const note of group.notes) details.append(element('h3', 'Apparatus note'), renderAlternativeContent(note.content), options.evidence(note.provenance));
        details.append(options.evidence(group.provenance)); section.append(details);
    });
    // Start after the section has entered the document; stale results never update another view.
    queueMicrotask(() => void refresh());
    return section;
}
