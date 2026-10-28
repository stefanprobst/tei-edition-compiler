import { compileAlternativesStudy } from '../src/experimental/alternatives';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { compileWithManifest, MappingProfileSchema, verifyCompilationSources, type Source, type AuthoritySource } from '../src';
const directory = 'fixtures/akademieprotokolle';
const fixture = await Bun.file(directory + '/manifest.json').json();
const profile = MappingProfileSchema.parse(await Bun.file(directory + '/mapping.json').json());
const sources: Source[] = [], authorities: AuthoritySource[] = [];
const links: Record<string, string> = {};
for (const [name, info] of Object.entries(fixture.files) as [string, { role: string; path: string; sha256: string; gitBlob: string }][]) {
    const bytes = await Bun.file(directory + '/' + name).bytes();
    if (createHash('sha256').update(bytes).digest('hex') !== info.sha256 || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== info.gitBlob) throw new Error('Upstream fixture changed: ' + name);
    const xml = new TextDecoder().decode(bytes);
    if (info.role === 'document') sources.push({ name, uri: 'https://id.acdh.oeaw.ac.at/akademieprotokolle/' + name, xml });
    else if (info.role === 'authority') authorities.push({ name, uri: profile.mapping.authorityDocuments!.person!, xml });
    else continue;
    links[name] = `${fixture.repository}/blob/${fixture.commit}/${info.path}`;
}
const bundle = compileWithManifest(sources, profile.mapping, { authorities });
const verified = verifyCompilationSources(bundle.edition, bundle.manifest, [...sources, ...authorities]);
const alternatives = compileAlternativesStudy(bundle.edition, bundle.manifest, [...sources, ...authorities]);
const output = 'packages/site/dist/akademie-input';
await mkdir(output, { recursive: true });
await Bun.write(output + '/edition.json', JSON.stringify(bundle.edition));
await Bun.write(output + '/manifest.json', JSON.stringify(bundle.manifest));
await Bun.write(output + '/alternatives.json', JSON.stringify(alternatives));
await Bun.write(output + '/site.json', JSON.stringify({ title: 'Akademieprotokolle · IR boundary study', attribution: 'Sitzungsprotokolle der Österreichischen Akademie der Wissenschaften. Stefan Sienell, ÖAW / ACDH and contributors credited in the originals. Upstream ARCHE metadata declares CC BY 4.0; source project description also retains an ÖAW 2020 rights statement. Diagnostic-bearing partial compilation: reading alternatives, polygon zones and physical layout remain uncompiled. Facsimiles are linked only; no images are vendored.', basePath: '/akademie/', sourceLinks: links }, null, 2));
console.log(JSON.stringify({ documents: bundle.edition.documents.length, entities: bundle.edition.entities.length, mentions: bundle.edition.mentions.length, resources: bundle.edition.resources.length, diagnostics: bundle.edition.diagnostics.length, experimentalGroups: alternatives.groups.length, experimentalUnsupported: alternatives.diagnostics.length, registerNames: bundle.edition.entities.filter(e => e.label).length, verified }));
