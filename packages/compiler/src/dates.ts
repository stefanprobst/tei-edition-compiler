import { DateValueSchema, type DateValue } from '@acdh-oeaw/tei-edition-ir';

type Report = (code: string, message: string) => void;
const groups = {
    exact: ['when', 'when-iso'],
    start: ['from', 'from-iso', 'notBefore', 'notBefore-iso'],
    end: ['to', 'to-iso', 'notAfter', 'notAfter-iso'],
};

export function dateValue(e: Element, report?: Report): DateValue {
    const label = (e.textContent || '').replace(/\s+/g, ' ').trim();
    const values = (names: string[]) => [...new Set(names.map(name => e.getAttribute(name)?.trim() ?? '').filter(Boolean))];
    const exact = values(groups.exact), start = values(groups.start), end = values(groups.end);
    const evidence = [...Object.values(groups).flat(), 'calendar', 'datingMethod'].filter(name => e.hasAttribute(name)).map(name => `${name}=${JSON.stringify(e.getAttribute(name))}`).join(', ');
    const fallback = (code: string, message: string): DateValue => {
        report?.(code, `${message}${evidence ? ` (${evidence})` : ''}`);
        return { kind: 'text', label: label || evidence || 'Unspecified date' };
    };
    const calendars = values(['calendar', 'datingMethod']);
    if (calendars.some(v => !['gregorian', '#gregorian'].includes(v.toLowerCase())))
        return fallback('unsupported-date-calendar', 'Calendar requires a project-specific mapping');
    if ([exact, start, end].some(values => values.length > 1) || (exact.length && (start.length || end.length)))
        return fallback('conflicting-date-attributes', 'Date attributes do not describe a single unambiguous value');
    let candidate: DateValue;
    if (exact.length) candidate = { kind: 'exact', value: exact[0], label };
    else if (start.length || end.length) candidate = { kind: 'interval', ...(start.length ? { start: start[0] } : {}), ...(end.length ? { end: end[0] } : {}), label };
    else {
        if (Object.values(groups).flat().some(name => e.hasAttribute(name))) return fallback('invalid-date', 'Date attributes have empty values');
        if (!label) return fallback('empty-date', 'Date has neither a value nor a label');
        return { kind: 'text', label };
    }
    const result = DateValueSchema.safeParse(candidate);
    return result.success ? result.data : fallback('invalid-date', result.error.issues.map(i => i.message).join('; '));
}
