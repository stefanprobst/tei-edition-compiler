import { describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';
import { compile } from '../src';

const directory = new URL('../../../fixtures/auden-musulin/', import.meta.url);
const sources = await Promise.all(['0028', '0062'].map(async n => {
    const name = `amp-transcript__${n}.xml`;
    return { name, xml: await Bun.file(new URL(name, directory)).text() };
}));
const edition = compile(sources);
const annotations = new Map(edition.annotations.map(a => [a.id, a]));
const minimal = (body: string) => `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="revision"><teiHeader><fileDesc><titleStmt><title>Revision</title></titleStmt></fileDesc></teiHeader><text><body><div type="transcription">${body}</div></body></text></TEI>`;

describe('revision stress fixtures', () => {
    test('pinned files retain their upstream checksums', async () => {
        const manifest = await Bun.file(new URL('manifest.json', directory)).json();
        for (const s of sources) expect(createHash('sha256').update(s.xml).digest('hex')).toBe(manifest.files[s.name]);
    });
    test('prose, embedded texts and peripheral page markers survive', () => {
        const [shorter, longer] = edition.documents;
        expect(shorter.parts.filter(p => p.kind === 'prose')).toHaveLength(12);
        expect(longer.parts.filter(p => p.kind === 'prose')).toHaveLength(7);
        expect(shorter.parts.filter(p => p.kind === 'embedded-text')).toHaveLength(2);
        expect(longer.parts.filter(p => p.kind === 'embedded-text')).toHaveLength(1);
        for (const [d, count] of [[shorter, 38], [longer, 96]] as const) {
            const partIds = new Set(d.parts.map(p => p.id));
            expect(edition.anchors.filter(a => partIds.has(a.partId))).toHaveLength(count);
            expect(d.parts[0].kind).toBe('transcript');
            expect(d.parts.some(p => (p.content?.text.length ?? 0) > 1000)).toBe(true);
            for (const p of d.parts.slice(1)) expect(p.parentOffset).toBeDefined();
        }
        expect(new Set(edition.diagnostics.map(d => d.code))).toEqual(new Set(['unresolved-interpretation']));
        expect(edition.entities.some(e => e.kind === 'work')).toBe(true);
        expect(edition.mentions.some(m => m.entityIds.length === 2 && m.label.includes('both men'))).toBe(true);
        expect(edition.annotations.some(a => a.kind === 'quotation' && a.evidence.length > 0)).toBe(true);
    });
    test('cross-document interpretations resolve while absent source documents stay external', () => {
        const links = edition.annotations.filter(a => a.kind === 'interpretation-link');
        const crossDocument = links.filter(link => link.targetIds.some(id => annotations.get(id)?.provenance.source !== link.provenance.source));
        expect(crossDocument).toHaveLength(4);
        expect(edition.diagnostics).toHaveLength(9);
        expect(links.flatMap(a => a.externalTargets ?? [])).toHaveLength(9);
        for (const link of crossDocument) {
            expect(link.provenance.source).toBe('amp-transcript__0028.xml');
            expect(link.targetIds.every(id => annotations.get(id)?.provenance.source === 'amp-transcript__0062.xml')).toBe(true);
        }
    });
    test('all substitutions have explicit insertion/deletion membership', () => {
        const groups = edition.annotations.filter(a => a.kind === 'substitution');
        expect(groups).toHaveLength(546);
        for (const group of groups) {
            const children = edition.annotations.filter(a => a.parentId === group.id);
            expect(children.some(a => a.kind === 'deletion')).toBe(true);
            expect(children.some(a => a.kind === 'insertion')).toBe(true);
        }
        const nested = groups.filter(a => a.parentId && annotations.get(a.parentId)?.kind === 'deletion');
        expect(nested).toHaveLength(12);
        const nestedInSubstitution = groups.filter(group => {
            let parent = group.parentId ? annotations.get(group.parentId) : undefined;
            while (parent) {
                if (parent.kind === 'substitution') return true;
                parent = parent.parentId ? annotations.get(parent.parentId) : undefined;
            }
            return false;
        });
        expect(nestedInSubstitution).toHaveLength(13);
        expect(edition.annotations.some(a => a.kind === 'insertion' && a.details.authoringHand === '#handwritten')).toBe(true);
    });
    test('compact semantic summary snapshot', () => {
        expect(edition.documents.map(d => {
            const partIds = new Set(d.parts.map(p => p.id));
            const local = edition.annotations.filter(a => a.range && partIds.has(a.range.partId));
            return {
                document: d.id,
                parts: d.parts.map(p => ({ kind: p.kind, parentId: p.parentId, parentOffset: p.parentOffset, characters: p.content?.text.length ?? 0 })),
                substitutions: local.filter(a => a.kind === 'substitution').length,
                anchors: edition.anchors.filter(a => partIds.has(a.partId)).length,
                diagnostics: edition.diagnostics.filter(a => a.provenance.source === d.provenance.source),
            };
        })).toMatchSnapshot();
    });
});

describe('nested annotation and part contracts', () => {
    const sample = compile([{ name: 'revision.xml', xml: minimal('<div type="prose"><p>X<subst><del><subst><del>a</del><add>b</add></subst></del><add>c</add></subst>Y<floatingText><body><div type="letter"><p>Inside</p></div></body></floatingText>Z</p></div>') }]);
    test('nested revisions preserve groups instead of inferring membership from ranges', () => {
        const groups = sample.annotations.filter(a => a.kind === 'substitution');
        const outer = groups.find(a => a.body === 'abc')!;
        const inner = groups.find(a => a.body === 'ab')!;
        const removed = sample.annotations.find(a => a.id === inner.parentId)!;
        expect(removed.kind).toBe('deletion');
        expect(removed.parentId).toBe(outer.id);
        const prose = sample.documents[0].parts.find(p => p.kind === 'prose')!;
        expect(prose.content?.text).toBe('XabcYZ\n');
        const embedded = sample.documents[0].parts.find(p => p.kind === 'embedded-text')!;
        expect(embedded.parentId).toBe(prose.id);
        expect(embedded.parentOffset).toBe(5);
        expect(sample.documents[0].parts.find(p => p.kind === 'letter')?.content?.text).toBe('Inside\n');
    });
    test('schema rejects cycles, wrong reference categories and invalid nesting', () => {
        const badParent = structuredClone(sample);
        const group = badParent.annotations.find(a => a.kind === 'substitution')!;
        group.parentId = group.id;
        expect(EditionSchema.safeParse(badParent).success).toBe(false);
        const badPart = structuredClone(sample);
        badPart.documents[0].parts[0].parentId = badPart.documents[0].parts[0].id;
        badPart.documents[0].parts[0].parentOffset = 0;
        expect(EditionSchema.safeParse(badPart).success).toBe(false);
        const wrongType = structuredClone(sample);
        wrongType.documents[0].resourceIds.push(wrongType.documents[0].id);
        expect(EditionSchema.safeParse(wrongType).success).toBe(false);
        const wrongOffset = structuredClone(sample);
        wrongOffset.documents[0].parts[1].parentOffset = 100000;
        expect(EditionSchema.safeParse(wrongOffset).success).toBe(false);
        const wrongRange = structuredClone(sample);
        const child = wrongRange.annotations.find(a => a.parentId && a.kind === 'insertion')!;
        child.range!.start = 0;
        expect(EditionSchema.safeParse(wrongRange).success).toBe(false);
        const missingOffset = structuredClone(sample);
        delete missingOffset.documents[0].parts[1].parentOffset;
        expect(EditionSchema.safeParse(missingOffset).success).toBe(false);
    });
    test('unmapped content outside parts is diagnosed', () => {
        const result = compile([{ name: 'revision.xml', xml: minimal('<p>Do not silently discard me</p>') }], { partKinds: {}, entityKinds: {} });
        expect(result.diagnostics.map(d => d.code)).toEqual(['unassigned-content']);
    });
});
