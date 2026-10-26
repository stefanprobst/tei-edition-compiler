import type { AnnotatedText, Provenance } from '@acdh-oeaw/tei-edition-ir';
const human = (value: string) => value.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[-_]/g, ' ');
function element<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) { const result = document.createElement(tag); if (text !== undefined) result.textContent = text; return result; }
export function renderAnnotatedText(content: AnnotatedText) {
    const output = element('div'); output.className = 'candidate-text annotated-text';
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
