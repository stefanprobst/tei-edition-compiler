import { expect, test } from 'bun:test';
import { entityDisplayName, type Edition } from '../src';
const entity: Edition['entities'][number] = { id: 'person', kind: 'person', authorityRef: 'https://example.test/people#1', resolution: 'external', provenance: { source: 'source', selector: 'opaque' } };
const mention = (label: string, id: string): Edition['mentions'][number] => ({ id, label, entityIds: ['person'], range: { partId: 'part', start: 0, end: label.length }, provenance: { source: 'source', selector: id } });

test('display names expose distinct text forms without promoting them to an authority label', () => {
    const input = { entities: [entity], mentions: [mention('Richard', 'first'), mention('Beer-Hofmann', 'second'), mention(' Richard\n', 'third')] };
    const before = JSON.stringify(input);
    expect(entityDisplayName(input, 'person')).toEqual({ label: 'Beer-Hofmann / Richard', source: 'text', forms: ['Beer-Hofmann', 'Richard'] });
    expect(JSON.stringify(input)).toBe(before);
    expect(entity.label).toBeUndefined();
});

test('a supplied register label takes precedence while retaining the recorded text forms', () => {
    const input = { entities: [{ ...entity, label: 'Beer-Hofmann, Richard' }], mentions: [mention('Richard', 'first')] };
    expect(entityDisplayName(input, 'person')).toEqual({ label: 'Beer-Hofmann, Richard', source: 'supplied', forms: ['Richard'] });
});

test('missing names and unknown identities are explicit rather than guessed from identifiers', () => {
    const input = { entities: [entity], mentions: [mention(' ', 'empty')] };
    expect(entityDisplayName(input, 'person')).toEqual({ label: 'Unnamed person', source: 'missing', forms: [] });
    expect(() => entityDisplayName(input, 'absent')).toThrow('Unknown entity');
});
