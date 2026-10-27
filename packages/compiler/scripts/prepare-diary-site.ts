import { deepStrictEqual, strictEqual } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { compile, compileWithManifest, createSourceIndex, MappingProfileSchema, verifyCompilationSources } from '../src';

const directory = 'fixtures/schnitzler-diary';
const upstream = await Bun.file(directory + '/manifest.json').json();
const sources = [];
for (const [name, info] of Object.entries(upstream.files) as [string, { sha256: string; gitBlob: string }][]) {
    const bytes = await Bun.file(directory + '/' + name).bytes();
    if (createHash('sha256').update(bytes).digest('hex') !== info.sha256 || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== info.gitBlob) throw new Error('Upstream fixture changed: ' + name);
    if (!name.endsWith('.xml')) continue;
    const source = { name, xml: new TextDecoder().decode(bytes) };
    createSourceIndex(source, { expectedSha256: info.sha256 }); sources.push(source);
}
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--person-register')) throw new Error('Usage: bun run site:prepare [--person-register <original-listperson.xml>]');
const authorities = [];
if (args.length) {
    const info = upstream.authorityFiles['listperson.xml'];
    const bytes = await Bun.file(args[1]).bytes();
    if (bytes.length !== info.bytes || createHash('sha256').update(bytes).digest('hex') !== info.sha256 || createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex') !== info.gitBlob) throw new Error('Person register does not match pinned upstream bytes');
    authorities.push({ name: 'listperson.xml', uri: info.uri, xml: new TextDecoder().decode(bytes) });
}
const profile = MappingProfileSchema.parse(await Bun.file(directory + '/mapping.json').json());
const bundle = compileWithManifest(sources, profile.mapping, { authorities });
if (authorities.length) {
    const plain = compile(sources, profile.mapping);
    deepStrictEqual(bundle.edition.documents, plain.documents);
    deepStrictEqual(bundle.edition.mentions, plain.mentions);
    deepStrictEqual(bundle.edition.entities.map(e => e.id), plain.entities.map(e => e.id));
    strictEqual(bundle.edition.entities.filter(e => e.label).length, 21);
    strictEqual(bundle.edition.entities.find(e => e.authorityRef.endsWith('#pmb10863'))?.label, 'Richard Beer-Hofmann');
    strictEqual(bundle.edition.diagnostics.length, 0);
}
const verified = verifyCompilationSources(bundle.edition, bundle.manifest, [...sources, ...authorities]);
const output = 'packages/site/dist/input';
await mkdir(output, { recursive: true });
await Bun.write(output + '/edition.json', JSON.stringify(bundle.edition));
await Bun.write(output + '/manifest.json', JSON.stringify(bundle.manifest));
await Bun.write(output + '/site.json', JSON.stringify({
    title: 'Schnitzler diary · IR publication study', basePath: '/diary/',
    attribution: 'Arthur Schnitzler: Tagebuch 1879–1931. Austrian Academy of Sciences; scholarly editors and contributors are credited in the canonical source headers. Repository license: CC BY-SA 4.0; XML publication statements: CC BY 4.0. Facsimile rights remain separate.',
    sourceLinks: Object.fromEntries([...sources.map(s => [s.name, `${upstream.repository}/blob/${upstream.commit}/editions/${s.name}`]), ...authorities.map(s => [s.name, `${upstream.repository}/blob/${upstream.commit}/${upstream.authorityFiles[s.name].path}`])]),
}, null, 2));
console.log(JSON.stringify({ documents: bundle.edition.documents.length, entities: bundle.edition.entities.length, mentions: bundle.edition.mentions.length, resources: bundle.edition.resources.length, diagnostics: bundle.edition.diagnostics.length, registerNames: bundle.edition.entities.filter(e => e.label).length, verified }));
