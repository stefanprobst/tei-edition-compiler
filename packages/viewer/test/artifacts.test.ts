import { expect, test } from 'bun:test';
import { compileWithManifest } from '../../compiler/src';
import { compileAlternativesStudy } from '../../compiler/src/experimental/alternatives';
import { fingerprintJson } from '../../compiler/src/fingerprints';
import { validateArtifactSet, readArtifactFiles } from '../src/artifacts';

const source = { name: '__proto__', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="portable"><teiHeader><title>Outside the demos</title></teiHeader><facsimile><surface xml:id="s"><graphic url="https://example.test/original.jpg"/></surface></facsimile><text><body>A<app><lem>first</lem><rdg>second</rdg></app><pb facs="#s"/>B</body></text></TEI>' };
const bundle = compileWithManifest([source], { partKinds: {}, elementPartKinds: { body: 'text' }, entityKinds: {} });
const alternatives = compileAlternativesStudy(bundle.edition, bundle.manifest, [source]);
const resourceId = bundle.edition.resources[0].id;
const presentation = { version: '1', editionSha256: bundle.manifest.editionSha256, attribution: 'Project-authored test metadata', sourceLinks: Object.fromEntries([[source.name, 'https://example.test/source.xml']]), previews: { [resourceId]: 'https://example.test/preview.jpg' } };
const inputs = () => structuredClone({ edition: bundle.edition, manifest: bundle.manifest, alternatives, presentation });

test('arbitrary compiled artifacts retain matching extensions and presentation without demo assumptions', async () => {
    const input = inputs(); const before = JSON.stringify(input);
    const loaded = await validateArtifactSet(input);
    expect(loaded.edition.documents[0].metadata.title).toBe('Outside the demos');
    expect(loaded.alternatives!.groups).toHaveLength(1);
    expect(loaded.presentation.previews[resourceId]).toBe('https://example.test/preview.jpg');
    expect(loaded.presentation.sourceLinks['__proto__']).toBe('https://example.test/source.xml');
    expect(Object.getPrototypeOf(loaded.presentation.sourceLinks)).toBeNull();
    expect(JSON.stringify(input)).toBe(before);
});

test('edition digest and manifest provenance inventory/roles are checked together', async () => {
    const edited = inputs(); edited.edition.documents[0].metadata.title = 'Changed';
    await expect(validateArtifactSet(edited)).rejects.toThrow('does not match');
    const missing = inputs(); missing.manifest.sources = [];
    await expect(validateArtifactSet(missing)).rejects.toThrow('missing provenance source');
    const wrongRole = inputs(); wrongRole.manifest.sources[0].role = 'authority'; wrongRole.manifest.sources[0].uri = 'https://example.test/source.xml';
    await expect(validateArtifactSet(wrongRole)).rejects.toThrow('Document provenance');
});

test('alternatives must match the exact edition and account for its markers', async () => {
    const mismatch = inputs(); mismatch.alternatives.editionSha256 = '0'.repeat(64);
    await expect(validateArtifactSet(mismatch)).rejects.toThrow('Alternatives do not match');
    const missing = inputs(); missing.alternatives.groups = [];
    await expect(validateArtifactSet(missing)).rejects.toThrow('missing source markers');
    const invalid = inputs(); (invalid.alternatives as unknown as { version: string }).version = 'old';
    await expect(validateArtifactSet(invalid)).rejects.toThrow('valid experimental');
});

test('presentation metadata is bound and rejects unknown identities, unsafe URLs and misspelled fields', async () => {
    const wrong = inputs(); wrong.presentation.editionSha256 = '0'.repeat(64);
    await expect(validateArtifactSet(wrong)).rejects.toThrow('Presentation metadata does not match');
    const resource = inputs(); resource.presentation.previews = { missing: 'https://example.test/image.jpg' };
    await expect(validateArtifactSet(resource)).rejects.toThrow('unknown resource');
    const source = inputs(); source.presentation.sourceLinks = { missing: 'https://example.test/source.xml' };
    await expect(validateArtifactSet(source)).rejects.toThrow('absent from the manifest');
    for (const uri of ['javascript:alert(1)', 'data:image/png,abc', 'file:///tmp/source.xml', '/relative']) {
        const unsafe = inputs(); unsafe.presentation.previews[resourceId] = uri;
        await expect(validateArtifactSet(unsafe)).rejects.toThrow('Presentation URLs');
    }
    await expect(validateArtifactSet({ ...inputs(), presentation: { ...presentation, preview: {} } })).rejects.toThrow('invalid structure');
});

test('omitted optional files never inherit presentation or alternatives from another load', async () => {
    await validateArtifactSet(inputs());
    const bare = await validateArtifactSet({ edition: bundle.edition, manifest: bundle.manifest });
    expect(bare.alternatives).toBeUndefined();
    expect(Object.keys(bare.presentation.sourceLinks)).toEqual([]);
    expect(Object.keys(bare.presentation.previews)).toEqual([]);
    expect(bare.presentation.attribution).toBe('');
    await expect(validateArtifactSet({ edition: bundle.edition, manifest: null })).rejects.toThrow('Manifest');
    await expect(validateArtifactSet({ ...inputs(), alternatives: null })).rejects.toThrow('Alternatives');
});

test('file roles are explicit and parse errors identify the failing role', async () => {
    const file = (data: unknown) => new File([JSON.stringify(data)], 'arbitrary-name.json', { type: 'application/json' });
    const loaded = await readArtifactFiles({ edition: file(bundle.edition), manifest: file(bundle.manifest), alternatives: file(alternatives), presentation: file(presentation) });
    expect(loaded.alternatives!.groups).toHaveLength(1);
    await expect(readArtifactFiles({ edition: file(bundle.edition), manifest: new File(['not JSON'], 'wrong.txt') })).rejects.toThrow('Manifest file is not valid JSON');
});

test('opaque resource IDs and mutable caller objects cannot alter a verified result', async () => {
    const input = inputs(); const previous = input.edition.resources[0].id;
    input.edition.resources[0].id = 'constructor';
    for (const document of input.edition.documents) {
        document.resourceIds = document.resourceIds.map(id => id === previous ? 'constructor' : id);
        for (const part of document.parts) part.resourceIds = part.resourceIds.map(id => id === previous ? 'constructor' : id);
    }
    for (const anchor of input.edition.anchors) anchor.resourceIds = anchor.resourceIds.map(id => id === previous ? 'constructor' : id);
    const hash = fingerprintJson(input.edition);
    input.manifest.editionSha256 = hash; input.alternatives.editionSha256 = hash; input.presentation.editionSha256 = hash;
    input.presentation.previews = { constructor: 'https://example.test/preview.jpg' };
    const pending = validateArtifactSet(input);
    input.edition.documents[0].metadata.title = 'Caller changed'; input.alternatives.groups[0].candidates[0].content.text = 'Caller changed';
    const opaqueId = ['constructor'].join('');
    input.presentation.previews[opaqueId] = 'https://example.test/changed.jpg';
    const result = await pending;
    expect(result.edition.documents[0].metadata.title).toBe('Outside the demos');
    expect(result.alternatives!.groups[0].candidates[0].content.text).toBe('first');
    expect(result.presentation.previews[opaqueId]).toBe('https://example.test/preview.jpg');
});
