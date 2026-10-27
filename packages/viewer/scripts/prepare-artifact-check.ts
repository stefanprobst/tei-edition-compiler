import { compileWithManifest } from '../../compiler/src';
import { compileAlternativesStudy } from '../../compiler/src/experimental/alternatives';

// Project-authored test data outside the built-in demos; no historical content or images.
const source = { name: 'independent-source.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:id="portable-reader"><teiHeader><title>Portable reader fixture</title></teiHeader><facsimile><surface xml:id="s"><graphic url="https://example.test/original.jpg"/></surface></facsimile><text><body>A<app><lem>first</lem><rdg>second</rdg></app><pb facs="#s"/>B</body></text></TEI>' };
const bundle = compileWithManifest([source], { partKinds: {}, elementPartKinds: { body: 'text' }, entityKinds: {} });
const alternatives = compileAlternativesStudy(bundle.edition, bundle.manifest, [source]);
const presentation = { version: '1', editionSha256: bundle.manifest.editionSha256, attribution: 'Project-authored portable reader test', sourceLinks: { [source.name]: 'https://example.test/canonical.xml' }, previews: { [bundle.edition.resources[0].id]: 'https://example.test/preview.jpg' } };
for (const [role, data] of Object.entries({ edition: bundle.edition, manifest: bundle.manifest, alternatives, presentation, badManifest: { ...bundle.manifest, editionSha256: '0'.repeat(64) }, badPresentation: { ...presentation, editionSha256: '0'.repeat(64) } })) await Bun.write('/tmp/tei-portable-' + role + '.json', JSON.stringify(data));
await Bun.write('/tmp/tei-portable-invalid.json', 'not JSON');
