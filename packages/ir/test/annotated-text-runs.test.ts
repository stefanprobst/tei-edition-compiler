import { expect, test } from 'bun:test';
import { AnnotatedTextSchema, annotatedTextRuns } from '../src';
test('shared annotated text runs preserve UTF-16 text, overlaps, language resets and conflicts', () => {
    const provenance = { source: 'notes.xml', selector: 'id("note")' };
    const annotation = (id: string, kind: string, start: number, end: number, extra = {}) => ({ id, kind, range: { start, end }, provenance, responsibilityTokens: [], sourceReferences: [], details: {}, ...extra });
    const content = AnnotatedTextSchema.parse({ kind: 'text', text: 'A😀BC\uFFFC', language: 'en', annotations: [
        annotation('del', 'deletion', 1, 5), annotation('em', 'emphasis', 1, 3),
        annotation('reset', 'language', 3, 4, { language: '' }),
        annotation('fr', 'language', 4, 5, { language: 'fr' }), annotation('de', 'language', 4, 5, { language: 'de' }),
        annotation('gap', 'missing-text', 5, 6), annotation('zero', 'language', 6, 6, { language: 'it' }),
    ] });
    const before = JSON.stringify(content), runs = annotatedTextRuns(content);
    expect(runs.map(run => run.text).join('')).toBe(content.text);
    for (const run of runs) expect(content.text.slice(run.start, run.end)).toBe(run.text);
    expect(runs.find(run => run.text === '😀')?.annotations.map(a => a.kind)).toEqual(['deletion', 'emphasis']);
    expect(runs.find(run => run.text === 'B')?.language).toBe('');
    expect(runs.find(run => run.text === 'C')?.languageConflict).toBe(true);
    expect(runs.find(run => run.text === 'C')?.language).toBe('');
    expect(runs.find(run => run.text === '\uFFFC')?.language).toBe('en');
    expect(annotatedTextRuns({ kind: 'text', text: '', annotations: [] })).toEqual([]);
    expect(JSON.stringify(content)).toBe(before);
});
