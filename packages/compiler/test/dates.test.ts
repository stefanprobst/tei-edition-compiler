import { expect, test } from 'bun:test';
import { compile } from '../src';

function result(date: string) {
    return compile([{ name: 'date.xml', xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="date"><teiHeader><fileDesc><titleStmt><title>Date test</title></titleStmt><sourceDesc><msDesc><history><origin>${date}</origin></history></msDesc></sourceDesc></fileDesc></teiHeader></TEI>` }]);
}
const value = (date: string) => result(date).documents[0].metadata.dates[0];

test('date extraction supports exact, bounded, open and textual dates', () => {
    expect(value('<origDate when="1963">1963</origDate>')).toEqual({ kind: 'exact', value: '1963', label: '1963' });
    expect(value('<origDate from-iso="1963-05" to-iso="1963-06">Summer</origDate>')).toEqual({ kind: 'interval', start: '1963-05', end: '1963-06', label: 'Summer' });
    expect(value('<origDate notBefore="1963"/>')).toEqual({ kind: 'interval', start: '1963', label: '' });
    expect(value('<origDate notAfter-iso="1963-05-12"/>')).toEqual({ kind: 'interval', end: '1963-05-12', label: '' });
    expect(value('<origDate>Sunday.</origDate>')).toEqual({ kind: 'text', label: 'Sunday.' });
});

test('invalid values become source-labelled text with diagnostic provenance', () => {
    for (const date of ['<origDate when="1963-02-29">Leap day?</origDate>', '<origDate notBefore="1964" notAfter="1963">1963–1964</origDate>']) {
        const edition = result(date);
        expect(edition.documents[0].metadata.dates[0].kind).toBe('text');
        expect(edition.diagnostics[0].code).toBe('invalid-date');
        expect(edition.diagnostics[0].provenance.source).toBe('date.xml');
        expect(edition.diagnostics[0].provenance.selector).toContain('/origDate[1]');
    }
    expect(value('<origDate when="nonsense"/>')).toEqual({ kind: 'text', label: 'when="nonsense"' });
});

test('conflicting attributes are preserved rather than chosen by precedence', () => {
    for (const date of ['<origDate when="1963" when-iso="1964"/>', '<origDate when="1963" notBefore="1962"/>', '<origDate from="1963" notBefore="1964"/>']) {
        const edition = result(date);
        expect(edition.documents[0].metadata.dates[0].kind).toBe('text');
        expect(edition.diagnostics[0].code).toBe('conflicting-date-attributes');
        expect(edition.diagnostics[0].message).toContain('1963');
    }
    expect(value('<origDate when="1963" when-iso="1963"/>').kind).toBe('exact');
});

test('calendars require an explicit supported interpretation', () => {
    const edition = result('<origDate calendar="#julian" when="1963-05-12">Julian date</origDate>');
    expect(edition.documents[0].metadata.dates[0]).toEqual({ kind: 'text', label: 'Julian date' });
    expect(edition.diagnostics[0].code).toBe('unsupported-date-calendar');
    expect(value('<origDate calendar="#gregorian" when="1963"/>').kind).toBe('exact');
    expect(result('<origDate calendar="#gregorian">Sunday</origDate>').diagnostics).toEqual([]);
});

test('empty dates do not crash the complete edition validator', () => {
    expect(value('<origDate/>')).toEqual({ kind: 'text', label: 'Unspecified date' });
    expect(result('<origDate/>').diagnostics[0].code).toBe('empty-date');
    expect(result('<origDate when=""/>').diagnostics[0].code).toBe('invalid-date');
});

test('correspondence dates use the same validation path as metadata dates', () => {
    const edition = compile([{ name: 'relation.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><fileDesc><titleStmt><title>Relation</title></titleStmt></fileDesc><profileDesc><correspDesc><correspAction type="sent"><date when="1963-13-01">Unknown day</date></correspAction></correspDesc></profileDesc></teiHeader></TEI>' }]);
    expect(edition.relations[0].date).toEqual({ kind: 'text', label: 'Unknown day' });
    expect(edition.diagnostics[0].provenance.selector).toContain('/date[1]');
});
