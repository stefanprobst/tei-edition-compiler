import { expect, test } from 'bun:test';
import { demoPreviewUri } from '../scripts/demo-media';

test('demo legacy identities resolve to the migrated IIIF image service', () => {
    expect(demoPreviewUri('https://iiif.acdh.oeaw.ac.at/amp/amp_0003/')).toBe('https://iiif.acdh.oeaw.ac.at/iiif/images/amp/amp_0003.jp2/full/!1000,1000/0/default.jpg');
    expect(demoPreviewUri('https://iiif.acdh.oeaw.ac.at/amp/amp_0454')).toBe('https://iiif.acdh.oeaw.ac.at/iiif/images/amp/amp_0454.jp2/full/!1000,1000/0/default.jpg');
});

test('demo migration rules do not rewrite unrelated, malformed or qualified resource identities', () => {
    for (const uri of ['https://example.test/amp/amp_0003/', 'http://iiif.acdh.oeaw.ac.at/amp/amp_0003/', 'https://iiif.acdh.oeaw.ac.at/amp/amp_0003/extra', 'https://iiif.acdh.oeaw.ac.at/amp/amp_0003/?q=1', 'https://iiif.acdh.oeaw.ac.at/amp/amp_0003/#fragment', 'https://iiif.acdh.oeaw.ac.at/amp/amp_0003.jpg', 'https://iiif.acdh.oeaw.ac.at/amp/amp_1/']) expect(demoPreviewUri(uri)).toBeUndefined();
});
