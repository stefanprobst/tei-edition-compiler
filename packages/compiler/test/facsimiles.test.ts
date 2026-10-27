import { expect, test } from 'bun:test';
import { compile, createSourceIndex } from '../src';

function source(facsimile: string, body: string, rootAttributes = '') {
    return {
        name: 'document.xml', uri: 'https://edition.example/document.xml',
        xml: `<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="document" ${rootAttributes}><teiHeader><fileDesc><titleStmt><title>Facsimile test</title></titleStmt></fileDesc></teiHeader><facsimile>${facsimile}</facsimile><text><body><div type="photo">${body}</div></body></text></TEI>`,
    };
}

test('relative image URLs and inherited XML bases resolve at compile time', () => {
    const result = compile([source('<surface xml:base="../scans/"><graphic xml:base="colour/" url="front.jpg"/></surface>', '<pb xml:base="https://images.example/scans/colour/" facs="front.jpg"/>', 'xml:base="https://images.example/assets/"')]);
    expect(result.resources[0].uri).toBe('https://images.example/scans/colour/front.jpg');
    expect(result.anchors[0].resourceIds).toEqual([result.resources[0].id]);
    expect(result.diagnostics).toEqual([]);
});

test('surface and graphic IDs, encoded fragments and document-qualified pointers resolve', () => {
    const result = compile([source('<surface xml:id="surface1"><graphic xml:id="graphic1" url="images/front.jpg"/></surface>', '<pb facs="#surface1 #graphic1 #graphic%31 document.xml#graphic1 file:///document.xml#surface1"/>')]);
    expect(result.resources[0].uri).toBe('https://edition.example/images/front.jpg');
    expect(result.anchors[0].resourceIds).toEqual([result.resources[0].id]);
    expect(result.diagnostics).toEqual([]);
});

test('a surface can reference several graphics without duplicate anchor resources', () => {
    const result = compile([source('<surface xml:id="s"><graphic xml:id="colour" url="colour.jpg"/><graphic xml:id="mono" url="mono.jpg"/></surface>', '<pb facs="#s #colour #mono #s"/>')]);
    expect(result.resources).toHaveLength(2);
    expect(result.anchors[0].resourceIds).toEqual(result.resources.map(r => r.id));
    expect(result.documents[0].parts[0].resourceIds).toEqual(result.resources.map(r => r.id));
});

test('each missing pointer is diagnosed even alongside successful references', () => {
    const s = source('<surface xml:id="s"><graphic url="front.jpg"/></surface>', '<pb facs="#s #missing #missing https://other.example/document.xml#s #%ZZ"/>');
    const result = compile([s]);
    expect(result.anchors[0].resourceIds).toHaveLength(1);
    expect(result.diagnostics.map(d => d.message)).toEqual(['#missing', 'https://other.example/document.xml#s', '#%ZZ']);
    const index = createSourceIndex(s);
    expect(result.diagnostics.every(d => index.resolve(d.provenance)?.localName === 'pb')).toBe(true);
});

test('page markers can exist without images; an explicitly empty pointer is diagnosed', () => {
    const result = compile([source('', '<pb/><pb facs=" "/>')]);
    expect(result.anchors).toHaveLength(2);
    expect(result.anchors.every(a => a.resourceIds.length === 0)).toBe(true);
    expect(result.documents[0].parts[0].content).toBeUndefined();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].code).toBe('unresolved-facsimile');
});

test('invalid or incomplete surface bounds keep usable image resources', () => {
    for (const [bounds, code] of [
        ['ulx="0" uly="0" lrx="10"', 'incomplete-surface-bounds'],
        ['ulx="10" uly="0" lrx="0" lry="10"', 'invalid-surface-bounds'],
        ['ulx="0" uly="0" lrx="10px" lry="10"', 'invalid-surface-bounds'],
        ['ulx="" uly="0" lrx="10" lry="10"', 'invalid-surface-bounds'],
        ['ulx="-1e308" uly="0" lrx="1e308" lry="10"', 'invalid-surface-bounds'],
    ]) {
        const result = compile([source(`<surface xml:id="s" ${bounds}><graphic url="front.jpg"/></surface>`, '<pb facs="#s"/>')]);
        expect(result.resources).toHaveLength(1);
        expect(result.resources[0].bounds).toBeUndefined();
        expect(result.anchors[0].resourceIds).toHaveLength(1);
        expect(result.diagnostics.map(d => d.code)).toEqual([code]);
        expect(result.diagnostics[0].provenance.selector).toBe('id("s")');
    }
});

test('valid surface bounds retain their origin and dimensions', () => {
    const result = compile([source('<surface ulx="-5.5" uly="2" lrx="14.5" lry="12"><graphic url="front.jpg"/></surface>', '<pb facs="front.jpg"/>')]);
    expect(result.resources[0].bounds).toEqual({ x: -5.5, y: 2, width: 20, height: 10 });
    expect(result.diagnostics).toEqual([]);
});

test('invalid graphic URLs are diagnosed rather than aborting the edition', () => {
    const result = compile([source('<surface xml:id="s"><graphic url="https://["/><graphic/></surface>', '<pb facs="#s"/>')]);
    expect(result.resources).toEqual([]);
    expect(result.anchors[0].resourceIds).toEqual([]);
    expect(result.diagnostics.map(d => d.code)).toEqual(['invalid-resource-uri', 'invalid-resource-uri', 'unresolved-facsimile']);
});

test('nested surfaces do not duplicate or misattribute graphic occurrences', () => {
    const result = compile([source('<surface xml:id="outer" ulx="0" uly="0" lrx="100" lry="100"><graphic url="outer.jpg"/><surface xml:id="inner" ulx="0" uly="0" lrx="10" lry="20"><graphic url="inner.jpg"/></surface></surface>', '<pb facs="#outer"/><pb facs="#inner"/>')]);
    expect(result.resources).toHaveLength(2);
    expect(result.resources.map(r => r.bounds?.width)).toEqual([100, 10]);
    expect(result.anchors.map(a => a.resourceIds)).toEqual(result.resources.map(r => [r.id]));
});

test('absolute graphic URIs can recover from an invalid inherited base', () => {
    const result = compile([source('<surface><graphic url="https://images.example/front.jpg"/><graphic xml:base="https://images.example/" url="back.jpg"/></surface>', '<pb facs="https://images.example/front.jpg"/>', 'xml:base="https://["')]);
    expect(result.resources.map(r => r.uri)).toEqual(['https://images.example/front.jpg', 'https://images.example/back.jpg']);
    expect(result.anchors[0].resourceIds).toEqual([result.resources[0].id]);
    expect(result.diagnostics.map(d => d.code)).toEqual(['invalid-resource-base']);
});

test('direct facsimile graphics resolve IDs and URLs alongside surfaces without inferred bounds', () => {
    const result = compile([source('<graphic xml:id="direct" url="direct.jpg"/><surface xml:id="surface"><graphic url="surface.jpg"/></surface><graphic/>', '<pb facs="#direct direct.jpg #surface"/>')]);
    expect(result.resources).toHaveLength(2);
    const direct = result.resources.find(r => r.uri.endsWith('direct.jpg'))!;
    expect(direct.bounds).toBeUndefined();
    expect(new Set(result.anchors[0].resourceIds)).toEqual(new Set(result.resources.map(r => r.id)));
    expect(result.diagnostics.map(d => d.code)).toEqual(['invalid-resource-uri']);
});

test('polygon zones are diagnosed per owning surface while keeping page images usable', () => {
    const result = compile([source('<surface xml:id="outer"><graphic url="outer.jpg"/><zone xml:id="polygon" points="0,0 10,0 0,10"><zone points="1,1 2,1 1,2"/></zone><surface xml:id="inner"><graphic url="inner.jpg"/><zone points="0,0 1,0 0,1"/></surface></surface>', '<pb facs="#outer #inner"/>')]);
    expect(result.resources).toHaveLength(2);
    expect(result.anchors[0].resourceIds).toHaveLength(2);
    expect(result.diagnostics.map(d => [d.code, d.message.split(' ')[0]])).toEqual([['unsupported-facsimile-zones', '2'], ['unsupported-facsimile-zones', '1']]);
});
