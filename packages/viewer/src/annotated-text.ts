import { annotatedTextRuns, type AnnotatedText, type Provenance } from '@acdh-oeaw/tei-edition-ir';
const human = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) { const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result; }
export function renderAnnotatedText(content: AnnotatedText) {
    const output = element('div'); output.className = 'candidate-text annotated-text';
    if (content.language !== undefined) output.lang = content.language;
    for (const run of annotatedTextRuns(content)) {
        const covering = run.annotations;
        const span = element('span', run.text.replaceAll('\uFFFC', '◇')); span.className = 'text-token';
        for (const annotation of covering) span.classList.add(annotation.kind);
        if (run.language !== undefined) span.lang = run.language;
        if (covering.length) span.title = [...new Set(covering.map(annotation => human(annotation.kind))), ...(run.languageConflict ? ['conflicting language declarations'] : [])].join(', ');
        output.append(span);
    }
    return output;
}

export function annotatedTextEvidence(content: AnnotatedText, provenance: (value: Provenance) => HTMLElement) {
    if (!content.annotations.length) return undefined;
    const details = element('details'); details.className = 'text-annotations'; details.append(element('summary', `Text annotations (${content.annotations.length})`));
    for (const annotation of content.annotations) {
        details.append(element('p', `${human(annotation.kind)}: ${content.text.slice(annotation.range.start, annotation.range.end).replaceAll('\uFFFC', '◇') || '(zero width)'}`));
        if (annotation.certainty) details.append(element('p', 'Certainty: ' + annotation.certainty));
        for (const [key, value] of Object.entries(annotation.details)) details.append(element('p', human(key) + ': ' + value));
        if (annotation.kind === 'language') details.append(element('p', 'Language: ' + (annotation.language || 'unknown')));
        details.append(provenance(annotation.provenance));
    }
    return details;
}
