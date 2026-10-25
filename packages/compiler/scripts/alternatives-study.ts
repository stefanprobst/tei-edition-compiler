import { compileWithManifest, MappingProfileSchema, createSourceIndex } from '../src';
import { compileAlternativesStudy } from '../src/experimental/alternatives';

// Reproducible experiment only; this is not a general publication/export command.
const manifest = await Bun.file('fixtures/dharma/manifest.json').json();
const sources = await Promise.all(Object.keys(manifest.files).filter(name => name.endsWith('.xml')).map(async name => ({ name, xml: await Bun.file('fixtures/dharma/' + name).text() })));
for (const source of sources) createSourceIndex(source, { expectedSha256: manifest.files[source.name] });
const profile = MappingProfileSchema.parse(await Bun.file('fixtures/dharma/mapping.json').json());
const bundle = compileWithManifest(sources, profile.mapping);
const study = compileAlternativesStudy(bundle.edition, bundle.manifest, sources);
process.stdout.write(JSON.stringify(study, null, 2) + '\n');
process.stderr.write(`${study.groups.length} supported groups; ${study.diagnostics.length} unsupported entries. Base edition remains diagnostic-bearing.\n`);
