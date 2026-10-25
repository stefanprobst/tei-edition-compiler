import { expect, test } from 'bun:test';
import { EditionSchema, documentEvents } from '@acdh-oeaw/tei-edition-ir';
import { textSegments, remoteUrl } from '../src/model';
import { compile } from '../../compiler/src';

const sample = compile([{ name: 'sample.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><title>Viewer boundary test</title></teiHeader><text><body><div type="letter" xml:lang="en">A😀<del>x<rs type="person" ref="https://example.test/person">Y</rs></del><add xml:lang="de">Z</add><gap/><space quantity="0" unit="char"/><pb/>end</div></body></text></TEI>' }]);
const part = sample.documents[0].parts[0];

test('viewer partitions overlapping annotations and mentions without changing UTF-16 text', () => {
    const segments = textSegments(sample, part.id, 0, part.content!.text.length);
    expect(segments.map(segment => segment.text).join('')).toBe(part.content!.text);
    const emoji = segments.find(segment => segment.text.includes('😀'))!;
    expect(emoji.end - emoji.start).toBe(3);
    const mention = segments.find(segment => segment.text === 'Y')!;
    expect(mention.mentionIds).toHaveLength(1);
    expect(mention.annotationIds).toContain(sample.annotations.find(annotation => annotation.kind === 'deletion')!.id);
    expect(segments.find(segment => segment.text === 'Z')?.language).toBe('de');
    expect(segments.at(-1)?.language).toBe('en');
    expect(segments.filter(segment => segment.text.includes('\uFFFC')).length).toBeGreaterThan(0);
    for (let i = 1; i < segments.length; i++) expect(segments[i].start).toBe(segments[i - 1].end);
});

test('viewer respects event boundaries, empty ranges and invalid requests', () => {
    const events = [...documentEvents(sample, sample.documents[0].id)];
    const reconstructed = events.filter(event => event.kind === 'text').flatMap(event => textSegments(sample, event.partId, event.start, event.end)).map(segment => segment.text).join('');
    expect(reconstructed).toBe(part.content!.text);
    expect(textSegments(sample, part.id, 0, 0)).toEqual([]);
    expect(() => textSegments(sample, part.id, 0, 9999)).toThrow('Invalid part text range');
    expect(() => textSegments(sample, 'missing', 0, 0)).toThrow();
});

test('viewer boundary accepts nontextual documents without fabricating text or names', () => {
    const photograph = EditionSchema.parse({ version: '0.2', id: 'photo-edition', documents: [{ id: 'photo', metadata: { title: 'Photograph', dates: [], languages: [], identifiers: [], rights: [] }, parts: [{ id: 'image-part', kind: 'photograph', order: 0, resourceIds: [], provenance: { source: 'photo.xml', selector: 'opaque' } }], resourceIds: [], relationIds: [], annotationIds: [], provenance: { source: 'photo.xml', selector: 'opaque' } }], entities: [], mentions: [], relations: [], annotations: [], resources: [], anchors: [], diagnostics: [] });
    expect(textSegments(photograph, 'image-part', 0, 0)).toEqual([]);
    expect([...documentEvents(photograph, 'photo')].some(event => event.kind === 'text')).toBe(false);
});

test('uploaded IR URLs never activate executable or local URI schemes', () => {
    for (const value of ['javascript:alert(1)', 'data:text/html,test', 'file:///etc/passwd', '/relative', 'not a url']) expect(remoteUrl(value)).toBeUndefined();
    expect(remoteUrl('https://example.test/image.jpg')).toBe('https://example.test/image.jpg');
    expect(remoteUrl('http://localhost:3000/')).toBe('http://localhost:3000/');
});

test('part occurrence labels follow explicit order without inventing work identities', async () => {
    const { partLabels } = await import('../src/model');
    const provenance = { source: 'opaque.xml', selector: 'opaque' };
    const parts = [
        { id: 'poem-b', kind: 'poem', order: 2, resourceIds: [], provenance },
        { id: 'letter', kind: 'letter', order: 0, resourceIds: [], provenance },
        { id: 'poem-a', kind: 'poem', order: 1, resourceIds: [], provenance },
    ];
    expect([...partLabels(parts)]).toEqual([['letter', 'letter'], ['poem-a', 'poem 1 of 2'], ['poem-b', 'poem 2 of 2']]);
    expect([...partLabels([...parts].reverse())]).toEqual([...partLabels(parts)]);
});

test('reading group order follows semantic events rather than extension storage order', async () => {
    const { alternativeGroupsForDocument } = await import('../src/model');
    const { compileAlternativesStudy } = await import('../../compiler/src/experimental/alternatives');
    const { compileWithManifest } = await import('../../compiler/src');
    const source = { name: 'order.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><title>Order</title></teiHeader><text><body><app><lem>a</lem><rdg>b</rdg></app><div type="embedded"><app><lem>c</lem><rdg>d</rdg></app></div><app><lem>e</lem><rdg>f</rdg></app></body></text></TEI>' };
    const bundle = compileWithManifest([source], { partKinds: { embedded: 'embedded' }, elementPartKinds: { body: 'text' }, entityKinds: {} });
    const study = compileAlternativesStudy(bundle.edition, bundle.manifest, [source]);
    study.groups.reverse(); bundle.edition.documents[0].parts.reverse();
    expect(alternativeGroupsForDocument(bundle.edition, study, bundle.edition.documents[0].id).map(group => group.candidates[0].content.text)).toEqual(['a', 'c', 'e']);
});
