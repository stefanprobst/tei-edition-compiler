import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { compile, createSourceIndex, type Source } from '../src';

function source(id: string, body: string, declarations = ''): Source {
    return { name: id + '.xml', uri: 'https://example.test/' + id + '.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="' + id + '"><teiHeader><fileDesc><titleStmt><title>Glyph test</title></titleStmt></fileDesc><encodingDesc>' + declarations + '</encodingDesc></teiHeader><text><body><div type="letter">' + body + '</div></body></text></TEI>' };
}
const declaration = '<charDecl><glyph xml:id="glyph1"><desc>Typed character with added dots</desc></glyph></charDecl>';

test('literal glyph readings retain ranges and link to source-backed descriptions', () => {
    const input = source('a', 'A<g ref="#glyph1">ä</g>B', declaration);
    const edition = compile([input]);
    const glyph = edition.annotations.find(a => a.kind === 'glyph')!;
    const description = edition.annotations.find(a => a.kind === 'glyph-description')!;
    expect(edition.documents[0].parts[0].content?.text).toBe('AäB');
    expect(glyph.range).toMatchObject({ start: 1, end: 2 });
    expect(glyph.evidence).toEqual(['#glyph1']);
    expect(description.targetIds).toEqual([glyph.id]);
    expect(description.body).toBe('Typed character with added dots');
    expect(createSourceIndex(input).resolve(description.provenance)?.localName).toBe('glyph');
    expect(edition.diagnostics).toEqual([]);
});

test('shared definitions resolve across supplied sources and are not duplicated by aliases', () => {
    const a = source('a', '<g ref="b.xml#glyph1">ä</g><g ref="https://example.test/b.xml#glyph1 file:///b.xml#glyph1">ä</g>');
    const b = source('b', '', declaration);
    const edition = compile([a, b]);
    const definitions = edition.annotations.filter(a => a.kind === 'glyph-description');
    expect(definitions).toHaveLength(1);
    expect(definitions[0].targetIds).toHaveLength(2);
    expect(definitions[0].provenance.source).toBe('b.xml');
    expect(edition.documents[1].annotationIds).toContain(definitions[0].id);
    const reverse = compile([b, a]);
    expect(reverse.annotations.find(a => a.kind === 'glyph-description')?.targetIds).toEqual(definitions[0].targetIds);
    expect(edition.diagnostics).toEqual([]);
});

test('missing definitions preserve readings and explicit unavailable source targets', () => {
    const edition = compile([source('a', 'A<g ref="#missing">ä</g>B')]);
    const glyph = edition.annotations.find(a => a.kind === 'glyph')!;
    expect(edition.documents[0].parts[0].content?.text).toBe('AäB');
    expect(glyph.externalTargets).toEqual([{ kind: 'annotation', source: 'https://example.test/a.xml', selector: 'id("missing")' }]);
    expect(edition.diagnostics[0].code).toBe('unresolved-glyph');
});

test('empty glyph readings get markers rather than inferred characters from descriptions', () => {
    const edition = compile([source('a', 'A<g ref="#glyph1"/>B', declaration)]);
    expect(edition.documents[0].parts[0].content?.text).toBe('A\uFFFCB');
    expect(edition.diagnostics.map(d => d.code)).toEqual(['unrendered-glyph']);
    expect(edition.annotations.find(a => a.kind === 'glyph-description')?.body).toBeDefined();
});

test('body work titles and postscripts are semantic ranges', () => {
    const edition = compile([source('a', '<p>See <title>Example Work</title>.</p><postscript><p>Afterthought.</p></postscript>')]);
    const part = edition.documents[0].parts[0];
    const title = edition.annotations.find(a => a.kind === 'work-title')!;
    const postscript = edition.annotations.find(a => a.kind === 'postscript')!;
    expect(part.content!.text.slice(title.range!.start, title.range!.end)).toBe('Example Work');
    expect(part.content!.text.slice(postscript.range!.start, postscript.range!.end)).toBe('Afterthought.\n');
    expect(edition.diagnostics).toEqual([]);
});

test('the pinned extension fixture preserves actual title, postscript and glyph evidence', async () => {
    const name = 'amp-transcript__0043.xml', xml = await Bun.file('fixtures/auden-musulin/' + name).text();
    const manifest = await Bun.file('fixtures/auden-musulin/manifest.json').json();
    expect(createHash('sha256').update(xml).digest('hex')).toBe(manifest.files[name]);
    const edition = compile([{ name, xml }]);
    expect(edition.annotations.filter(a => a.kind === 'work-title')).toHaveLength(1);
    expect(edition.annotations.filter(a => a.kind === 'postscript')).toHaveLength(1);
    const occurrence = edition.annotations.find(a => a.kind === 'glyph')!;
    const part = edition.documents[0].parts.find(p => p.id === occurrence.range!.partId)!;
    expect(part.content!.text.slice(occurrence.range!.start, occurrence.range!.end)).toBe('ä');
    const description = edition.annotations.find(a => a.kind === 'glyph-description')!;
    expect(description.body).toContain('superimposing');
    expect(createSourceIndex({ name, xml }).resolve(description.provenance)?.getAttribute('xml:id')).toBe('uml_a_lc_tt');
    expect(edition.diagnostics).toEqual([]);
});
