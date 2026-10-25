import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';
import { compileWithManifest, createSourceIndex, MappingProfileSchema, verifyCompilationSources } from '../src';

const name = 'DHARMA_CritEdAmaramalaBLBurnell436e.xml';
const fixture = await Bun.file('fixtures/dharma/manifest.json').json();
const xml = await Bun.file('fixtures/dharma/' + name).text();
const profile = MappingProfileSchema.parse(await Bun.file('fixtures/dharma/mapping.json').json());
const source = { name, xml };
const bundle = compileWithManifest([source], profile.mapping);
const edition = EditionSchema.parse(JSON.parse(JSON.stringify(bundle.edition)));
const index = createSourceIndex(source, { expectedSha256: fixture.files[name] });

test('independent critical-edition fixture retains pinned original bytes and attribution', async () => {
    for (const [name, hash] of Object.entries(fixture.files)) {
        const bytes = Buffer.from(await Bun.file('fixtures/dharma/' + name).arrayBuffer());
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(hash as string);
        expect(createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex')).toBe(fixture.gitBlobs[name]);
    }
    expect(index.root.getElementsByTagNameNS('http://www.tei-c.org/ns/1.0', 'witness')).toHaveLength(1);
    expect(edition.documents[0].metadata.rights.join(' ')).toContain('creativecommons.org/licenses/by/4.0/');
});

test('real apparatus entries never concatenate lemma, variant and scholarly notes as running text', () => {
    const markers = edition.annotations.filter(annotation => annotation.kind === 'uncompiled-content');
    expect(markers).toHaveLength(23);
    expect(edition.diagnostics.filter(diagnostic => diagnostic.code === 'unsupported-textual-apparatus')).toHaveLength(23);
    const parts = new Map(edition.documents[0].parts.map(part => [part.id, part]));
    for (const marker of markers) {
        expect(marker.range).toBeDefined();
        expect(parts.get(marker.range!.partId)!.content!.text.slice(marker.range!.start, marker.range!.end)).toBe('\uFFFC');
        expect(marker.body).toBeUndefined();
        expect(index.resolve(marker.provenance)?.localName).toBe('app');
    }
    expect(edition.documents[0].parts.map(part => part.content?.text ?? '').join('')).not.toContain('caraṇa-carṇa-');
    expect(verifyCompilationSources(edition, bundle.manifest, [source]).verifiedSources).toBe(1);
});

test('real nonbreaking manuscript line boundaries preserve words and source evidence', () => {
    const text = edition.documents[0].parts.map(part => part.content?.text ?? '').join('');
    expect(text).toContain('śabda-bhedam r̥juṁ kurve');
    const continuations = edition.annotations.filter(annotation => annotation.kind === 'line-continuation');
    const original = Array.from(index.root.getElementsByTagNameNS('http://www.tei-c.org/ns/1.0', 'lb')).filter(element => element.getAttribute('break') === 'no');
    expect(continuations).toHaveLength(original.length);
    for (const annotation of continuations) {
        expect(annotation.range!.start).toBe(annotation.range!.end);
        expect(index.resolve(annotation.provenance)?.getAttribute('break')).toBe('no');
    }
    expect(edition.documents[0].parts.map(part => part.kind)).toEqual(['edition', 'section', 'section', 'translation', 'commentary', 'bibliography']);
});

test('uncompiled choices and grouped apparatus retain containment without choosing or flattening branches', () => {
    const source = { name: 'alternatives.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><title>Boundary</title></teiHeader><text><body><p>A<add><choice><orig>colour</orig><reg>color</reg></choice></add>B<app><rdgGrp><rdg>one</rdg><rdg>two</rdg></rdgGrp></app>C</p></body></text></TEI>' };
    const result = compileWithManifest([source], { partKinds: {}, elementPartKinds: { body: 'text' }, entityKinds: {} });
    expect(result.edition.documents[0].parts[0].content!.text).toBe('A\uFFFCB\uFFFCC\n');
    const markers = result.edition.annotations.filter(annotation => annotation.kind === 'uncompiled-content');
    expect(markers).toHaveLength(2);
    const parent = result.edition.annotations.find(annotation => annotation.id === markers[0].parentId)!;
    expect(parent.kind).toBe('insertion');
    expect(parent.range).toEqual(markers[0].range);
    expect(result.edition.diagnostics.map(diagnostic => diagnostic.code)).toEqual(['unsupported-text-alternatives', 'unsupported-textual-apparatus']);
    expect(verifyCompilationSources(result.edition, result.manifest, [source]).verifiedSources).toBe(1);
});

test('manuscript page labels use the existing generic anchor label field', () => {
    expect(edition.anchors).toHaveLength(17);
    expect(edition.anchors.slice(0, 3).map(anchor => anchor.label)).toEqual(['1r', '1v', '2r']);
    expect(edition.anchors.every(anchor => anchor.resourceIds.length === 0)).toBe(true);
});
