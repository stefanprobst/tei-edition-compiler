import { expect, test } from 'bun:test';
import { compile, type Source } from '../src';

function source(id: string, body: string, extraHeader = ''): Source {
    return { name: `${id}.xml`, uri: `https://edition.example/${id}.xml`, xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="${id}"><teiHeader><fileDesc><titleStmt><title>References</title></titleStmt></fileDesc>${extraHeader}</teiHeader><text><body><div type="transcription">${body}</div></body></text></TEI>` };
}
const links = (edition: ReturnType<typeof compile>) => edition.relations.filter(r => r.predicate === 'references').sort((a, b) => a.id.localeCompare(b.id));

test('relative document references resolve after all supplied sources are compiled', () => {
    const a = source('a', '<ref target="b.xml">Other document</ref>'), b = source('b', 'Text');
    const forward = compile([a, b]), reverse = compile([b, a]);
    expect(links(forward)).toEqual(links(reverse));
    expect(links(forward)[0].objectIds).toEqual(['b']);
    expect(links(forward)[0].externalTargets).toBeUndefined();
    const annotation = forward.annotations.find(a => a.kind === 'link')!;
    expect(links(forward)[0].subjectId).toBe(annotation.id);
    expect(annotation.evidence).toEqual(['b.xml']);
    expect(forward.documents[0].relationIds).toContain(links(forward)[0].id);
    expect(forward.diagnostics).toEqual([]);
});

test('multiple targets and equivalent aliases deduplicate internal and external destinations', () => {
    const edition = compile([source('a', '<ref target="b.xml file:///b.xml https://other.example/b.xml https://other.example/b.xml">References</ref>'), source('b', '')]);
    const relation = links(edition)[0];
    expect(relation.objectIds).toEqual(['b']);
    expect(relation.externalTargets).toEqual([{ kind: 'document', sourceId: 'https://other.example/b.xml' }]);
    expect(edition.diagnostics).toEqual([]);
});

test('compiled part, interpretation and root fragments resolve to their semantic IR IDs', () => {
    const a = source('a', '<ref target="b.xml#section b.xml#comment b.xml#b">References</ref>');
    const b = source('b', '<div type="letter" xml:id="section">Letter</div>', '<encodingDesc><interpGrp><interp xml:id="comment"><desc>Comment</desc></interp></interpGrp></encodingDesc>');
    const edition = compile([a, b]);
    const part = edition.documents[1].parts.find(p => p.kind === 'letter')!;
    const annotation = edition.annotations.find(a => a.kind === 'interpretation')!;
    expect(links(edition)[0].objectIds).toEqual([part.id, annotation.id, 'b']);
    expect(edition.diagnostics).toEqual([]);
});

test('correspondence document identifiers use the project convention without changing ordinary fragment scope', () => {
    const a = source('a', '<ref target="#b.xml">Local fragment</ref>', '<profileDesc><correspDesc><correspContext><ref type="withinCollection" subtype="next_letter" target="#b.xml">Next</ref></correspContext></correspDesc></profileDesc>');
    const edition = compile([a, source('b', '')]);
    expect(edition.relations.find(r => r.predicate === 'next_letter')?.objectIds).toEqual(['b']);
    expect(links(edition)[0].objectIds).toEqual([]);
    expect(links(edition)[0].externalTargets?.[0].sourceId).toBe('https://edition.example/a.xml#b.xml');
    expect(edition.diagnostics[0].code).toBe('unresolved-document-fragment');
});

test('missing sources stay external while unsupported fragments and malformed targets are diagnosed', () => {
    const edition = compile([source('a', '<seg xml:id="inline">Inline</seg><ref target="#inline missing.xml https://[">References</ref><ref target=" ">Empty</ref>')]);
    const relation = links(edition).find(r => r.externalTargets?.length)!;
    expect(relation.objectIds).toEqual([]);
    expect(relation.externalTargets?.map(t => t.sourceId)).toEqual(['https://edition.example/a.xml#inline', 'https://edition.example/missing.xml', 'https://[']);
    expect(new Set(edition.diagnostics.map(d => d.code))).toEqual(new Set(['empty-document-reference', 'unresolved-document-fragment', 'invalid-document-reference']));
});

test('references inside scholarly commentary belong to the interpretation annotation', () => {
    const a = source('a', '', '<encodingDesc><interpGrp><interp xml:id="comment"><desc>See <ref target="b.xml">another document</ref>.</desc></interp></interpGrp></encodingDesc>');
    const edition = compile([a, source('b', '')]);
    expect(links(edition)[0].subjectId).toBe(edition.annotations.find(a => a.kind === 'interpretation')!.id);
    expect(links(edition)[0].objectIds).toEqual(['b']);
    expect(edition.annotations.some(a => a.kind === 'link')).toBe(false);
    expect(links(edition)[0].provenance.selector).toBe('id("comment")/desc[1]/ref[1]');
});

test('external web and PDF targets remain portable URI references', () => {
    const edition = compile([source('a', '<ref target="https://web.example/page#section https://web.example/work.pdf">Sources</ref>')]);
    expect(links(edition)[0].externalTargets?.map(t => t.sourceId)).toEqual(['https://web.example/page#section', 'https://web.example/work.pdf']);
    expect(edition.documents).toHaveLength(1);
    expect(edition.diagnostics).toEqual([]);
});

test('real corpus commentary resolves supplied memoir and photograph destinations', async () => {
    const sources = await Promise.all(['0001', '0040', '0078', '0028', '0062'].map(async n => {
        const name = `amp-transcript__${n}.xml`;
        return { name, xml: await Bun.file(new URL(`../../../fixtures/auden-musulin/${name}`, import.meta.url)).text() };
    }));
    const edition = compile(sources), documentIds = new Set(edition.documents.map(d => d.id));
    const references = links(edition);
    expect(references).toHaveLength(23);
    const internal = references.filter(r => r.objectIds.some(id => documentIds.has(id)));
    expect(internal).toHaveLength(2);
    expect(internal.map(r => r.objectIds[0]).sort()).toEqual(['amp-transcript__0062.xml', 'amp-transcript__0078.xml']);
    expect(internal.map(r => edition.annotations.find(a => a.id === r.subjectId)?.kind).sort()).toEqual(['interpretation', 'link']);
    expect(edition.diagnostics).toHaveLength(9);
    expect(edition.diagnostics.every(d => d.code === 'unresolved-interpretation')).toBe(true);
});

test('an empty fragment on a document pointer resolves to the document itself', () => {
    const edition = compile([source('a', '<ref target="b.xml#">Document</ref>'), source('b', '')]);
    expect(links(edition)[0].objectIds).toEqual(['b']);
    expect(edition.diagnostics).toEqual([]);
});
