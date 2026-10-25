import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { compile, createSourceIndex } from '../src';

const sample = (body: string) => compile([{ name: 'address.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><title>Address</title></teiHeader><text><body><div type="letter"><address>' + body + '</address></div></body></text></TEI>' }]);

test('semantic address lines retain ranges and separate adjacent lines', () => {
    const edition = sample('<addrLine>First line</addrLine><addrLine>Second line</addrLine>');
    const part = edition.documents[0].parts[0];
    expect(part.content?.text).toBe('First line\nSecond line\n');
    const lines = edition.annotations.filter(a => a.kind === 'address-line');
    expect(lines.map(a => part.content!.text.slice(a.range!.start, a.range!.end))).toEqual(['First line', 'Second line']);
    expect(edition.diagnostics).toEqual([]);
});

test('explicit line breaks after address lines are preserved once', () => {
    const edition = sample('<addrLine>First line</addrLine><!-- source formatting -->\n<lb/><addrLine>Second line</addrLine><lb/>');
    expect(edition.documents[0].parts[0].content?.text).toBe('First line\nSecond line\n');
});

test('the real dependency fixture compiles with address-line and mention provenance', async () => {
    const name = 'amp-transcript__0009.xml';
    const xml = await Bun.file('fixtures/auden-musulin/' + name).text();
    const manifest = await Bun.file('fixtures/auden-musulin/manifest.json').json();
    expect(createHash('sha256').update(xml).digest('hex')).toBe(manifest.files[name]);
    const edition = compile([{ name, xml }]);
    const line = edition.annotations.find(a => a.kind === 'address-line')!;
    expect(line).toBeDefined();
    const part = edition.documents[0].parts.find(p => p.id === line.range!.partId)!;
    const value = part.content!.text.slice(line.range!.start, line.range!.end);
    expect(value).toBe('℅ Heyworth');
    expect(part.content!.text.slice(line.range!.end, line.range!.end + 2)).not.toBe('\n\n');
    const index = createSourceIndex({ name, xml });
    expect(index.resolve(line.provenance)?.localName).toBe('addrLine');
    expect(edition.mentions.some(m => m.range.partId === part.id && m.range.start >= line.range!.start && m.range.end <= line.range!.end && m.label === 'Heyworth')).toBe(true);
    expect(edition.diagnostics).toEqual([]);
});
