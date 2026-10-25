import { expect, test } from 'bun:test';
import { DateValueSchema } from '../src';

const exact = (value: string) => DateValueSchema.safeParse({ kind: 'exact', value, label: value }).success;
const interval = (start: string | undefined, end: string | undefined) => DateValueSchema.safeParse({ kind: 'interval', ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}), label: '' }).success;

test('date values retain supported precision and timezone spelling', () => {
    for (const value of ['0001', '1963', '1963-05', '1963-05-12', '2000-02-29', '1963-05-12T12:00:00', '1963-05-12T12:00:00Z', '1963-05-12T12:00:00.1+01:00', '1963-05-12T12:00:00.123-14:00']) {
        const result = DateValueSchema.parse({ kind: 'exact', value, label: 'Original date' });
        expect(result).toEqual({ kind: 'exact', value, label: 'Original date' });
    }
});

test('impossible dates and unsupported syntax do not become machine-readable values', () => {
    for (const value of ['', 'Sunday', '0000', '1963-00', '1963-13', '1963-02-29', '1900-02-29', '2000-02-30', '1963-04-31', '1963-05-00', '1963-05-12T24:00:00Z', '1963-05-12T12:60:00Z', '1963-05-12T12:00:60Z', '1963-05-12T12:00:00+14:01', '1963-05-12T12:00:00+01:60', '1963-05-12T12:00:00.1234Z', '1963-05-12Z', '-0044-03-15', ' 1963 ']) expect(exact(value)).toBe(false);
});

test('interval validation respects open bounds and overlapping coarse precision', () => {
    for (const [start, end] of [['1963', undefined], [undefined, '1963-05'], ['1963', '1963-01-01'], ['1963-12-31', '1963'], ['1963-05', '1963-05-01'], ['1963-05-12', '1963-05-12']]) expect(interval(start, end)).toBe(true);
    for (const [start, end] of [[undefined, undefined], ['', '1963'], ['1964', '1963'], ['1963-06', '1963-05-31'], ['2000-02-30', undefined]]) expect(interval(start, end)).toBe(false);
});

test('timestamp ordering uses offsets rather than lexical ordering', () => {
    expect(interval('1963-05-12T12:00:00+02:00', '1963-05-12T11:30:00+01:00')).toBe(true);
    expect(interval('1963-05-12T11:00:00Z', '1963-05-12T12:00:00+02:00')).toBe(false);
    expect(interval('1963-05-12T12:00:00.2Z', '1963-05-12T12:00:00.1Z')).toBe(false);
    expect(interval('1963-05-12T12:00:00.2Z', '1963-05-12T12:00:00Z')).toBe(true); // Overlapping second precision.
});

test('floating timestamps stay floating; mixed timezone contexts are not guessed', () => {
    expect(interval('1963-05-13T12:00:00', '1963-05-12T12:00:00')).toBe(false);
    expect(interval('1963-05-13T12:00:00Z', '1963-05-12')).toBe(true);
    expect(interval('1963-05-13T12:00:00', '1963-05-12T12:00:00Z')).toBe(true);
});
