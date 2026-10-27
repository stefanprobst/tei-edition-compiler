import { mkdir } from 'node:fs/promises';
import { demoPreviewUri } from './demo-media';
import { compileAlternativesStudy } from '../../compiler/src/experimental/alternatives';
import { MappingProfileSchema } from '../../compiler/src';
import { compileWithManifest, verifyCompilationSources, createSourceIndex } from '../../compiler/src';

const output = 'packages/viewer/dist';
const manifest = await Bun.file('fixtures/auden-musulin/manifest.json').json();
const sources = await Promise.all((manifest.cohorts.initial as string[]).map(async name => ({ name, xml: await Bun.file('fixtures/auden-musulin/' + name).text() })));
for (const source of sources) createSourceIndex(source, { expectedSha256: manifest.files[source.name] });
const bundle = compileWithManifest(sources);
verifyCompilationSources(bundle.edition, bundle.manifest, sources);
await mkdir(output, { recursive: true });
const build = await Bun.build({ entrypoints: ['packages/viewer/src/app.ts'], outdir: output, target: 'browser', minify: true });
if (!build.success) throw new Error(build.logs.join('\n'));
await Promise.all([
    Bun.write(output + '/edition.json', JSON.stringify(bundle.edition)),
    Bun.write(output + '/edition.manifest.json', JSON.stringify(bundle.manifest, null, 2)),
    Bun.write(output + '/index.html', Bun.file('packages/viewer/src/index.html')),
    Bun.write(output + '/style.css', Bun.file('packages/viewer/src/style.css')),
    Bun.write(output + '/presentation.json', JSON.stringify({
        version: '1', editionSha256: bundle.manifest.editionSha256,
        attribution: 'Auden–Musulin Papers · Austrian Academy of Sciences. XML: CC BY 4.0; literary and image rights remain separate. Images load from the upstream service.',
        sourceLinks: Object.fromEntries(sources.map(source => [source.name, `https://github.com/Auden-Musulin-Papers/amp-data/blob/${manifest.commit}/data/editions/${source.name}`])),
        // Explicit demo adapter. Runtime consumers receive rendition URLs, never project URI rules.
        previews: Object.fromEntries(bundle.edition.resources.flatMap(resource => { const preview = demoPreviewUri(resource.uri); return preview ? [[resource.id, preview]] : []; })),
    })),
]);
console.log('Built reference viewer for ' + bundle.edition.documents.length + ' documents.');

const studyManifest = await Bun.file('fixtures/dharma/manifest.json').json();
const studySources = await Promise.all(Object.keys(studyManifest.files).filter(name => name.endsWith('.xml')).map(async name => ({ name, xml: await Bun.file('fixtures/dharma/' + name).text() })));
for (const source of studySources) createSourceIndex(source, { expectedSha256: studyManifest.files[source.name] });
const profile = MappingProfileSchema.parse(await Bun.file('fixtures/dharma/mapping.json').json());
const studyBundle = compileWithManifest(studySources, profile.mapping);
const study = compileAlternativesStudy(studyBundle.edition, studyBundle.manifest, studySources);
await Promise.all([
    Bun.write(output + '/study-edition.json', JSON.stringify(studyBundle.edition)),
    Bun.write(output + '/study-edition.manifest.json', JSON.stringify(studyBundle.manifest)),
    Bun.write(output + '/study.json', JSON.stringify(study)),
    Bun.write(output + '/study-presentation.json', JSON.stringify({
        version: '1', editionSha256: studyBundle.manifest.editionSha256,
        attribution: 'DHARMA / ERC 809994 · Arlo Griffiths, Zakariya Pamuji Aminullah and Ryugen Tanemura. Source XML: CC BY 4.0. Experimental partial compilation; consult source evidence.',
        sourceLinks: Object.fromEntries(studySources.map(source => [source.name, `https://github.com/erc-dharma/tfd-sanskrit-philology/blob/${studyManifest.commit}/editions/${source.name}`])),
        previews: {},
    })),
]);
console.log('Built alternatives study for ' + studyBundle.edition.documents.length + ' documents.');
