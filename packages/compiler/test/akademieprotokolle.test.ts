import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { compileWithManifest, MappingProfileSchema, verifyCompilationSources, type Source, type AuthoritySource } from '../src';
const directory = new URL('../../../fixtures/akademieprotokolle/', import.meta.url);
const manifest = await Bun.file(new URL('manifest.json', directory)).json();
const profile = MappingProfileSchema.parse(await Bun.file(new URL('mapping.json', directory)).json());
const sources: Source[] = [], authorities: AuthoritySource[] = [];
for (const [name, info] of Object.entries(manifest.files) as [string, { role: string }][]) {
    if (!['document', 'authority'].includes(info.role)) continue;
    const xml = await Bun.file(new URL(name, directory)).text();
    if (info.role === 'document') sources.push({ name, uri: 'https://id.acdh.oeaw.ac.at/akademieprotokolle/' + name, xml });
    else authorities.push({ name, uri: profile.mapping.authorityDocuments!.person!, xml });
}
const bundle = compileWithManifest(sources, profile.mapping, { authorities });
const edition = bundle.edition;

test('all originals including licensing evidence retain upstream hashes and provenance verifies', async () => {
    for (const [name, info] of Object.entries(manifest.files) as [string, { sha256: string; gitBlob: string }][]) {
        const bytes = await Bun.file(new URL(name, directory)).bytes();
        expect(createHash('sha256').update(bytes).digest('hex')).toBe(info.sha256);
        expect(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')).toBe(info.gitBlob);
    }
    expect(verifyCompilationSources(edition, bundle.manifest, [...sources, ...authorities])).toEqual({ verifiedSources: 3, verifiedProvenanceRecords: 536 });
});

test('meeting titles and dates, ordered pages and source images survive without genre-specific IR', () => {
    expect(edition.documents.map(d => d.metadata.title)).toEqual(['Sitzung der phil.-hist. Klasse am 24. November 1847', 'Gesamtsitzung am 29. Mai 1852']);
    expect(edition.documents.map(d => d.metadata.dates[0])).toEqual([{ kind: 'exact', value: '1847-11-24', label: '24. November 1847' }, { kind: 'exact', value: '1852-05-29', label: '29. Mai 1852' }]);
    expect(edition.documents.map(d => d.parts.length)).toEqual([6, 1]);
    expect(edition.resources).toHaveLength(7);
    expect(edition.anchors).toHaveLength(7);
    expect(edition.anchors.every(a => a.resourceIds.length === 1)).toBe(true);
    expect(edition.resources[6].uri).toBe('https://diarium-images.acdh-dev.oeaw.ac.at/ga/Seite_NaN');
    expect(edition.relations.filter(r => r.predicate.includes('participant'))).toHaveLength(0);
});

test('shared authorities and literal numeric/abbreviation evidence do not guess roles or readings', () => {
    expect(edition.entities).toHaveLength(82);
    expect(edition.mentions).toHaveLength(146);
    expect(edition.entities.filter(e => e.kind === 'person' && e.label)).toHaveLength(65);
    expect(edition.entities.filter(e => e.kind === 'place').every(e => !e.label)).toBe(true);
    expect(edition.entities.filter(e => e.authorityRef.endsWith('#grillparzer-franz'))).toHaveLength(1);
    expect(edition.annotations.filter(a => a.kind === 'number-expression')).toHaveLength(40);
    expect(edition.annotations.filter(a => a.kind === 'abbreviation-marker')).toMatchObject([{ body: '.' }]);
    const markers = edition.annotations.filter(a => a.kind === 'uncompiled-content');
    expect(markers).toHaveLength(64);
    for (const marker of markers) {
        const part = edition.documents.flatMap(d => d.parts).find(p => p.id === marker.range!.partId)!;
        expect(part.content!.text.slice(marker.range!.start, marker.range!.end)).toBe('\uFFFC');
        expect(marker.body).toBeUndefined();
    }
});

test('unsupported readings, polygon zones and layout remain explicit diagnostics with source evidence', () => {
    const counts = Object.fromEntries(['unsupported-text-alternatives', 'unsupported-facsimile-zones', 'uncompiled-presentation'].map(code => [code, edition.diagnostics.filter(d => d.code === code).length]));
    expect(counts).toEqual({ 'unsupported-text-alternatives': 64, 'unsupported-facsimile-zones': 7, 'uncompiled-presentation': 2 });
    expect(edition.diagnostics).toHaveLength(73);
    expect(edition.annotations.some(a => a.details.renderingReference === '#ll')).toBe(true);
    expect(edition.annotations.some(a => a.details.sourceResourcePointer?.includes('_region_'))).toBe(true);
    expect(edition.resources.every(r => r.bounds !== undefined)).toBe(true);
});
