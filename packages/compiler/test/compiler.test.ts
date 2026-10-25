import { describe, expect, test } from 'bun:test';
import { compile } from '../src';
import { EditionSchema, DateValueSchema } from '@tei-edition/ir';
import { createHash } from 'node:crypto';
const fixtureDir = new URL('../../../fixtures/auden-musulin/', import.meta.url);
const names = ['0001', '0040', '0078'].map(n => `amp-transcript__${n}.xml`);
const sources = await Promise.all(names.map(async (name) => ({ name, xml: await Bun.file(new URL(name, fixtureDir)).text() })));
const edition = compile(sources);
const minimal = (body: string) => `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="sample"><teiHeader><fileDesc><titleStmt><title>Sample</title></titleStmt></fileDesc></teiHeader><text><body>${body}</body></text></TEI>`;
describe('pinned source compilation', () => {
    test('complete deterministic snapshot', () => { expect(edition).toMatchSnapshot(); expect(compile(sources)).toEqual(edition); });
    test('fixtures remain byte-identical', async () => { const manifest = await Bun.file(new URL('manifest.json', fixtureDir)).json(); for (const s of sources)
        expect(createHash('sha256').update(s.xml).digest('hex')).toBe(manifest.files[s.name]); });
    test('compound objects retain nested poem occurrences and all surfaces', () => {
        const [letter, compound, photo] = edition.documents;
        expect(letter.parts.map(p => p.kind)).toEqual(['transcript', 'envelope', 'letter']);
        expect(compound.parts.map(p => p.kind)).toEqual(['transcript', 'envelope', 'letter', 'poem', 'poem']);
        expect(compound.parts.filter(p => p.kind === 'poem').every(p => p.parentId === compound.parts[2].id)).toBe(true);
        expect(compound.resourceIds).toHaveLength(6);
        expect(photo.parts.map(p => p.kind)).toEqual(['transcript', 'photograph']);
        expect(photo.parts.every(p => p.content === undefined)).toBe(true);
        expect(edition.relations.filter(r => r.subjectId === photo.id && r.predicate === 'participant')).toHaveLength(3);
        expect(edition.relations.find(r => r.subjectId === photo.id && r.predicate === 'setting')?.date?.kind).toBe('interval');
        expect(edition.diagnostics).toEqual([]);
    });
    test('mentions use offsets in the emitted text; nested uncertainty survives', () => {
        const m = edition.mentions.find(m => m.label === 'Chester');
        expect(m).toBeDefined();
        for (const mention of edition.mentions) {
            const p = edition.documents.flatMap(d => d.parts).find(p => p.id === mention.range.partId)!;
            expect(p.content!.text.slice(mention.range.start, mention.range.end)).toBe(mention.label);
        }
        expect(edition.annotations.some(a => a.kind === 'missing-text' && a.details.quantity === '1')).toBe(true);
        const interpretation = edition.annotations.find(a => a.kind === 'interpretation')!;
        expect(interpretation.certainty).toBe('high');
        expect(interpretation.responsibility).toContain('smayer');
        expect(edition.annotations.some(a => a.kind === 'interpretation-link' && a.targetIds.includes(interpretation.id))).toBe(true);
    });
});
describe('compiler contracts', () => {
    test('namespaces are resolved by URI, not lexical prefix', () => {
        const xml = minimal('<div type="letter"><p>Hello <rs type="person" ref="#person">Ada</rs><lb/>world.</p></div>');
        const prefixed = xml.replace(/<(\/?)([A-Za-z][\w]*)/g, '<$1t:$2').replace('xmlns=', 'xmlns:t=');
        expect(compile([{ name: 'sample', xml: prefixed }])).toEqual(compile([{ name: 'sample', xml }]));
    });
    test('prefix changes preserve all fixture header relationships', () => {
        const prefixed = sources.map(s => ({ ...s, xml: s.xml.replace(/<(\/?)([A-Za-z][\w]*)/g, '<$1t:$2').replace('xmlns=', 'xmlns:t=') }));
        expect(compile(prefixed)).toEqual(edition);
    });
    test('photo descriptions are relation evidence, not entity labels', () => {
        const photo = edition.documents[2];
        const participants = edition.relations.filter(r => r.subjectId === photo.id && r.predicate === 'participant');
        expect(participants.map(r => r.description)).toEqual(['left side', 'right side', 'photographer']);
        expect(edition.entities.some(e => ['left side', 'right side', 'photographer'].includes(e.label || ''))).toBe(false);
    });
    test('unknown source constructs emit diagnostics', () => {
        const result = compile([{ name: 'sample', xml: minimal('<div type="letter"><choice><sic>word</sic><corr>correction</corr></choice></div>') }]);
        expect(result.diagnostics[0].code).toBe('unmapped-content');
    });
    test('declarative project part mapping', () => { const result = compile([{ name: 'sample', xml: minimal('<div type="memo"><p>Memo</p></div>') }], { partKinds: { memo: 'memorandum' }, entityKinds: {} }); expect(result.documents[0].parts[0].kind).toBe('memorandum'); });
    test('rejects malformed XML, non-TEI, DTD and duplicate documents', () => {
        for (const xml of ['<no/>', '<TEI>', '<!DOCTYPE TEI>' + minimal('')])
            expect(() => compile([{ name: 'sample', xml }])).toThrow();
        expect(() => compile([sources[0], sources[0]])).toThrow('Duplicate source');
    });
    test('reports unresolved resource references', () => { expect(compile([{ name: 'sample', xml: minimal('<div type="photo"><pb facs="#missing"/></div>') }]).diagnostics[0].code).toBe('unresolved-facsimile'); });
    test('schema rejects wrong version, dangling IDs and out-of-range offsets', () => {
        expect(EditionSchema.safeParse({ ...edition, version: '1.0' }).success).toBe(false);
        const copy = structuredClone(edition);
        copy.mentions[0].entityIds = ['missing'];
        expect(EditionSchema.safeParse(copy).success).toBe(false);
        const range = structuredClone(edition);
        range.mentions[0].range.end = 999999;
        expect(EditionSchema.safeParse(range).success).toBe(false);
        expect(DateValueSchema.safeParse({ kind: 'interval', label: 'unknown' }).success).toBe(false);
        for (const d of [{ kind: 'exact', value: '1963', label: '1963' }, { kind: 'interval', start: '1963', label: 'after 1963' }, { kind: 'text', label: 'Sunday' }])
            expect(DateValueSchema.safeParse(d).success).toBe(true);
    });
});
