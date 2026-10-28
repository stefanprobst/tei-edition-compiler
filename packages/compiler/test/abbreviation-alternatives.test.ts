import { expect, test } from 'bun:test';
import { compileWithManifest, createSourceIndex, MappingProfileSchema } from '../src';
import { compileAlternativesStudy } from '../src/experimental/alternatives';
import { AlternativesStudySchema, assertAlternativeAnchors, projectAlternative } from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';
import { projectDocumentAlternatives, selectedSourceRangesForText, projectSelectedSourceRange } from '@acdh-oeaw/tei-edition-ir/experimental/document-alternatives';
import { EditionSchema } from '@acdh-oeaw/tei-edition-ir';
const directory = new URL('../../../fixtures/akademieprotokolle/', import.meta.url);
const profile = MappingProfileSchema.parse(await Bun.file(new URL('mapping.json', directory)).json());
const sources = await Promise.all(['C_0001.xml', 'A_0058.xml'].map(async name => ({ name, uri: 'https://id.acdh.oeaw.ac.at/akademieprotokolle/' + name, xml: await Bun.file(new URL(name, directory)).text() })));
const authorities = [{ name: 'listperson.xml', uri: profile.mapping.authorityDocuments!.person!, xml: await Bun.file(new URL('listperson.xml', directory)).text() }];
const bundle = compileWithManifest(sources, profile.mapping, { authorities });
const before = JSON.stringify(bundle);
const study = compileAlternativesStudy(bundle.edition, bundle.manifest, [...sources, ...authorities]);
const sample = (entry: string) => {
    const source = { name: 'abbr.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader/><text><body><p>A' + entry + 'B</p></body></text></TEI>' };
    const bundle = compileWithManifest([source], { partKinds: {}, entityKinds: {}, elementPartKinds: { body: 'text' } });
    return { bundle, study: compileAlternativesStudy(bundle.edition, bundle.manifest, [source]) };
};

test('all 64 real choices preserve both forms, literal marks and superscript evidence without changing base IR', () => {
    expect(JSON.stringify(bundle)).toBe(before);
    expect(bundle.edition.version).toBe('0.4');
    expect(study.version).toBe('0.3');
    expect(study.groups).toHaveLength(64);
    expect(study.diagnostics).toEqual([]);
    expect(study.witnesses).toEqual([]);
    expect(bundle.edition.diagnostics).toHaveLength(73);
    expect(study.groups.every(g => g.kind === 'abbreviation-expansion')).toBe(true);
    expect(study.groups.every(g => g.candidates.map(c => c.role).join(',') === 'expanded-form,abbreviated-form')).toBe(true);
    const local = study.groups.flatMap(g => g.candidates.flatMap(c => c.content.annotations));
    expect(local.filter(a => a.kind === 'abbreviation-marker')).toHaveLength(54);
    expect(local.filter(a => a.kind === 'superscript')).toHaveLength(20);
    const indexes = new Map(sources.map(s => [s.name, createSourceIndex(s)]));
    for (const group of study.groups) for (const candidate of group.candidates) {
        const index = indexes.get(candidate.provenance.source)!;
        expect(candidate.content.text).toBe(index.resolve(candidate.provenance)!.textContent!);
        for (const annotation of candidate.content.annotations) expect(candidate.content.text.slice(annotation.range.start, annotation.range.end)).toBe(index.resolve(annotation.provenance)!.textContent!);
    }
});

test('explicit abbreviated and expanded projections preserve candidate coordinates and anchors', async () => {
    const document = bundle.edition.documents.find(d => d.id === 'A_0058.xml')!;
    const groups = study.groups.filter(g => g.provenance.source === document.provenance.source);
    const unselected = await projectDocumentAlternatives(bundle.edition, study, document.id, [], { deletionText: 'retain', candidateDeletionText: 'retain' });
    expect(unselected.issues.filter(issue => issue.code === 'unselected-alternative')).toHaveLength(6);
    for (const role of ['abbreviated-form', 'expanded-form']) {
        const selections = groups.map(g => ({ groupId: g.id, candidateId: g.candidates.find(c => c.role === role)!.id }));
        const projection = await projectDocumentAlternatives(bundle.edition, study, document.id, selections, { deletionText: 'retain', candidateDeletionText: 'retain' });
        expect(projection.choices).toHaveLength(6);
        expect(projection.issues).toEqual([]);
        expect(projection.anchors).toEqual(unselected.anchors);
        expect(projection.text).toContain(role === 'abbreviated-form' ? 'P. T.' : 'pleno titolo');
        for (const run of projection.runs.filter(run => run.source.kind === 'candidate')) {
            expect(selectedSourceRangesForText(projection, run)).toEqual([run.source]);
            expect(projectSelectedSourceRange(projection, run.source)).toEqual([{ start: run.start, end: run.end }]);
        }
    }
    expect(JSON.stringify(bundle)).toBe(before);
});

test('unsupported choice structures and nested semantics are rejected atomically', () => {
    for (const entry of [
        '<choice><orig>old</orig><reg>regular</reg></choice>',
        '<choice><abbr>A</abbr><expan>Alpha</expan><expan>Other</expan></choice>',
        '<choice><abbr>A</abbr></choice>',
        '<choice><abbr>A<unknown/></abbr><expan>Alpha</expan></choice>',
        '<choice><abbr wit="#w">A</abbr><expan>Alpha</expan></choice>',
        '<choice><abbr>A<choice><abbr>B</abbr><expan>Beta</expan></choice></abbr><expan>Alpha</expan></choice>',
    ]) {
        const result = sample(entry);
        expect(result.study.groups).toEqual([]);
        expect(result.study.diagnostics).toHaveLength(1);
        expect(result.bundle.edition.documents[0].parts[0].content!.text).toBe('A\uFFFCB\n');
    }
});

test('group kinds, neutral roles and stale artifacts are validated explicitly', () => {
    const result = sample('<choice><abbr>P<am>.</am></abbr><expan>pleno</expan></choice>');
    const group = result.study.groups[0];
    expect(projectAlternative(result.study, group.id, group.candidates[0].id, { deletionText: 'retain' }).text).toBe('P.');
    const invalidRole = structuredClone(result.study); invalidRole.groups[0].candidates[0].role = 'editorial-base';
    expect(AlternativesStudySchema.safeParse(invalidRole).success).toBe(false);
    const invalidKind = structuredClone(result.study); invalidKind.groups[0].kind = 'textual-variation';
    expect(AlternativesStudySchema.safeParse(invalidKind).success).toBe(false);
    expect(AlternativesStudySchema.safeParse({ ...result.study, version: '0.2' }).success).toBe(false);
    expect(EditionSchema.safeParse({ ...result.bundle.edition, version: '0.3' }).success).toBe(false);
    const wrongFeature = structuredClone(result.bundle.edition);
    wrongFeature.annotations.find(a => a.kind === 'uncompiled-content')!.details.feature = 'textual-apparatus';
    expect(() => assertAlternativeAnchors(wrongFeature, result.study)).toThrow('kind differs');
});
