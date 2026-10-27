import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { compileWithManifest, MappingProfileSchema, verifyCompilationSources, type Source } from '../src';
const sources: Source[] = [];
const links: Record<string, string> = {};
for (const [directory, base] of [
    ['schnitzler-diary', 'https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-tagebuch/editions/'],
    ['schnitzler-letters', 'https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-briefe/editions/'],
]) {
    const fixture = await Bun.file(`fixtures/${directory}/manifest.json`).json();
    for (const [name, info] of Object.entries(fixture.files) as [string, { path: string; sha256: string; gitBlob: string }][]) {
        const bytes = await Bun.file(`fixtures/${directory}/${name}`).bytes();
        if (createHash('sha256').update(bytes).digest('hex') !== info.sha256 || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== info.gitBlob) throw new Error('Upstream source changed: ' + name);
        if (!name.endsWith('.xml')) continue;
        sources.push({ name, uri: base + name, xml: new TextDecoder().decode(bytes) });
        links[name] = `${fixture.repository}/blob/${fixture.commit}/${info.path}`;
    }
}
const profile = MappingProfileSchema.parse(await Bun.file('fixtures/schnitzler-letters/mapping.json').json());
const bundle = compileWithManifest(sources, profile.mapping);
const verified = verifyCompilationSources(bundle.edition, bundle.manifest, sources);
const output = 'packages/site/dist/paired-input';
await mkdir(output, { recursive: true });
await Bun.write(output + '/edition.json', JSON.stringify(bundle.edition));
await Bun.write(output + '/manifest.json', JSON.stringify(bundle.manifest));
await Bun.write(output + '/site.json', JSON.stringify({ title: 'Schnitzler letter and diary · linked commentary study', attribution: 'Olga Schnitzler correspondence, edited by Martin Anton Müller and Gerd-Hermann Susen; Arthur Schnitzler: Tagebuch, Austrian Academy of Sciences and contributors credited in source headers. Letter XML: CC BY 4.0; diary repository: CC BY-SA 4.0, diary XML: CC BY 4.0. Facsimile rights remain separate.', basePath: '/pair/', sourceLinks: links }, null, 2));
console.log(JSON.stringify({ documents: bundle.edition.documents.length, notes: bundle.edition.annotations.filter(a => a.kind === 'note').length, diagnostics: bundle.edition.diagnostics.length, verified }));
