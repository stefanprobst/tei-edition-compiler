import { expect, test } from 'bun:test';
import { AlternativesStudySchema, selectAlternative, projectAlternative, alternativeSourceRangesForText, projectAlternativeSourceRange } from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';
import { compileWithManifest, createSourceIndex, MappingProfileSchema } from '../src';
import { compileAlternativesStudy, verifyAlternativesStudy } from '../src/experimental/alternatives';

const names = ['DHARMA_CritEdAmaramalaBLBurnell436e.xml', 'DHARMA_CritEdSarvatathagatatattvasangraha.xml'];
const pinned = await Bun.file('fixtures/dharma/manifest.json').json();
const sources = await Promise.all(names.map(async name => ({ name, xml: await Bun.file('fixtures/dharma/' + name).text() })));
const mapping = MappingProfileSchema.parse(await Bun.file('fixtures/dharma/mapping.json').json()).mapping;
const bundle = compileWithManifest(sources, mapping);
const before = JSON.stringify(bundle);
const study = compileAlternativesStudy(bundle.edition, bundle.manifest, sources);

function sample(body: string, declarations = '<witness xml:id="w"><abbr>W</abbr></witness>', name = 'study.xml') {
    const source = { name, xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0" xml:lang="en"><teiHeader><fileDesc><titleStmt><title>Study</title></titleStmt><sourceDesc><listWit>' + declarations + '</listWit></sourceDesc></fileDesc></teiHeader><text><body><p>' + body + '</p></body></text></TEI>' };
    const bundle = compileWithManifest([source], { partKinds: {}, elementPartKinds: { body: 'text' }, entityKinds: {} });
    return { source, bundle, study: compileAlternativesStudy(bundle.edition, bundle.manifest, [source]) };
}

test('the experimental real-source study accounts for every marker without changing the edition', () => {
    expect(JSON.stringify(bundle)).toBe(before);
    expect(study.version).toBe('0.2');
    expect(bundle.edition.version).toBe('0.3');
    expect(study.groups.filter(group => group.provenance.source === names[0])).toHaveLength(22);
    expect(study.groups.filter(group => group.provenance.source === names[1])).toHaveLength(13);
    expect(study.diagnostics).toHaveLength(2);
    expect(new Set([...study.groups, ...study.diagnostics].map(entry => entry.markerId)).size).toBe(37);
    expect(study.editionSha256).toBe(bundle.manifest.editionSha256);
    expect(verifyAlternativesStudy(bundle.edition, JSON.parse(JSON.stringify(study)))).toEqual(study);
});

test('multiple attestations remain manuscript and edition evidence with explicit candidate selection', () => {
    const group = study.groups.find(group => group.candidates.some(candidate => candidate.content.text === 'rājāhaṁ'))!;
    const candidate = group.candidates.find(candidate => candidate.content.text === 'rājāhaṁ')!;
    const selected = selectAlternative(study, group.id, candidate.id);
    expect(selected.role).toBe('variant');
    expect(selected.witnessIds).toHaveLength(2);
    expect(selected.witnessIds.map(id => study.witnesses.find(witness => witness.id === id)!.kind)).toEqual(['edition', 'edition']);
    expect(study.witnesses.filter(witness => witness.kind === 'manuscript')).toHaveLength(2);
    expect(study.witnesses.filter(witness => witness.kind === 'edition').map(witness => witness.label)).toEqual(['EdH', 'EdY']);
    expect(study.witnesses.find(witness => witness.kind === 'manuscript' && witness.provenance.source === names[1])?.label).toBeUndefined();
    expect(() => selectAlternative(study, group.id, undefined as unknown as string)).toThrow();
    expect(() => selectAlternative(study, group.id, study.groups.find(other => other.id !== group.id)!.candidates[0].id)).toThrow();
    selected.content.text = 'changed';
    expect(candidate.content.text).toBe('rājāhaṁ');
});

test('every study record round-trips to a pinned source revision', () => {
    const indexes = new Map(sources.map(source => [source.name, createSourceIndex(source, { expectedSha256: pinned.files[source.name] })]));
    const records = [...study.witnesses, ...study.groups, ...study.groups.flatMap(group => [...group.candidates, ...group.notes, ...[...group.candidates, ...group.notes].flatMap(owner => owner.content.annotations)]), ...study.diagnostics];
    for (const record of records) {
        const index = indexes.get(record.provenance.source)!;
        const element = index.resolve(record.provenance)!;
        expect(element).toBeDefined();
        expect(index.selector(element)).toBe(record.provenance.selector);
    }
});

test('empty and neutral readings remain explicit and never gain an inferred preferred candidate', () => {
    const { study } = sample('<app><rdg wit="#w"/><rdg wit="#w">other</rdg></app>');
    expect(study.groups).toHaveLength(1);
    const group = study.groups[0];
    expect(group.candidates.map(candidate => candidate.role)).toEqual(['variant', 'variant']);
    expect(selectAlternative(study, group.id, group.candidates[0].id).content.text).toBe('');
    expect(group.candidates[0].witnessIds).toEqual(group.candidates[1].witnessIds);
});

test('unresolved witnesses, grouped readings, external anchoring and unsupported content quarantine whole groups', () => {
    for (const body of [
        '<app><lem>base</lem><rdg wit="#missing">other</rdg></app>',
        '<app><lem>base</lem><rdg wit="other.xml#w">other</rdg></app>',
        '<app><lem>base</lem><rdg wit="#w">a<unknown>b</unknown></rdg></app>',
        '<app><lem>base</lem><rdgGrp><rdg wit="#w">other</rdg></rdgGrp></app>',
        '<app from="#a" to="#b"><lem>base</lem><rdg wit="#w">other</rdg></app>',
        '<choice><orig>base</orig><reg>other</reg></choice>',
        '<app><lem>a</lem><lem>b</lem><rdg>c</rdg></app>',
        '<app><note>Only commentary</note></app>',
        '<app><lem>a</lem>or<rdg>b</rdg></app>',
    ]) {
        const { study } = sample(body);
        expect(study.groups).toHaveLength(0);
        expect(study.witnesses).toHaveLength(0);
        expect(study.diagnostics).toHaveLength(1);
    }
});

test('reading and note assertions preserve declared evidence without decoding project tokens', () => {
    const { study } = sample('<app resp="#editor" cert="low"><lem type="emn" xml:lang="" source="#source">base</lem><rdg wit="#w" hand="#h" varSeq="2">other</rdg><note resp="#editor" xml:lang="en">A note.</note></app>');
    const group = study.groups[0];
    expect(group.certainty).toBe('low');
    expect(group.responsibilityTokens).toEqual(['#editor']);
    expect(group.candidates[0].details).toEqual({ classification: 'emn' });
    expect(group.candidates[0].sourceReferences).toEqual(['#source']);
    expect(group.candidates[0].content.language).toBe('');
    expect(group.candidates[1].details).toEqual({ authoringHand: '#h', recordedSequence: '2' });
    expect(group.candidates[1].content.language).toBe('en');
    expect(group.notes[0].content.text).toBe('A note.');
    expect(group.notes[0].responsibilityTokens).toEqual(['#editor']);
});

test('local witness fragments never merge across source documents', () => {
    const first = sample('<app><lem>a</lem><rdg wit="#w">b</rdg></app>', '<witness xml:id="w"><abbr>Same</abbr></witness>', 'first.xml');
    const second = sample('<app><lem>c</lem><rdg wit="#w">d</rdg></app>', '<witness xml:id="w"><abbr>Same</abbr></witness>', 'second.xml');
    const sources = [first.source, second.source];
    const bundle = compileWithManifest(sources, { partKinds: {}, elementPartKinds: { body: 'text' }, entityKinds: {} });
    const result = compileAlternativesStudy(bundle.edition, bundle.manifest, sources);
    expect(result.witnesses).toHaveLength(2);
    expect(result.groups[0].candidates[1].witnessIds).not.toEqual(result.groups[1].candidates[1].witnessIds);
    const foreignScope = sample('<app><lem>a</lem><rdg wit="#w">b</rdg></app>', '<x:listWit xmlns:x="urn:foreign"><witness xml:id="w"><abbr>W</abbr></witness></x:listWit>');
    expect(foreignScope.study.groups).toHaveLength(0);
    expect(foreignScope.study.diagnostics).toHaveLength(1);
});

test('schema and artifact binding reject ambiguous, dangling and incomplete studies', () => {
    const { bundle, study } = sample('<app><lem>a</lem><rdg wit="#w">b</rdg></app>');
    const dangling = structuredClone(study); dangling.groups[0].candidates[1].witnessIds = ['missing'];
    expect(AlternativesStudySchema.safeParse(dangling).success).toBe(false);
    const duplicate = structuredClone(study); duplicate.groups[0].candidates[1].role = 'editorial-base';
    expect(AlternativesStudySchema.safeParse(duplicate).success).toBe(false);
    expect(() => verifyAlternativesStudy(bundle.edition, { ...study, groups: [] })).toThrow('missing source markers');
    expect(() => verifyAlternativesStudy(bundle.edition, { ...study, editionSha256: '0'.repeat(64) })).toThrow('does not match');
    const falseAnchor = structuredClone(study); falseAnchor.groups[0].markerId = bundle.edition.documents[0].parts[0].id;
    expect(() => verifyAlternativesStudy(bundle.edition, falseAnchor)).toThrow('existing source marker');
    const wrongSource = structuredClone(study); wrongSource.groups[0].candidates[0].provenance.source = 'absent.xml';
    expect(() => verifyAlternativesStudy(bundle.edition, wrongSource)).toThrow('absent document source');
    const collision = structuredClone(study); collision.groups[0].candidates[0].id = bundle.edition.documents[0].id;
    expect(() => verifyAlternativesStudy(bundle.edition, collision)).toThrow('collides');
});

test('source revision checks run before experimental extraction', () => {
    const { source, bundle } = sample('<app><lem>a</lem><rdg>b</rdg></app>');
    expect(() => compileAlternativesStudy(bundle.edition, bundle.manifest, [{ ...source, xml: source.xml + '\n' }])).toThrow('Source hash mismatch');
});

test('real candidate-local deletion retains evidence while explicit projections map surviving text', () => {
    const group = study.groups.find(group => group.candidates.some(candidate => candidate.content.text === 'paramasāsibhir'))!;
    const candidate = group.candidates.find(candidate => candidate.content.text === 'paramasāsibhir')!;
    const deletion = candidate.content.annotations.find(annotation => annotation.kind === 'deletion')!;
    expect(candidate.content.text.slice(deletion.range.start, deletion.range.end)).toBe('ma');
    const retained = projectAlternative(study, group.id, candidate.id, { deletionText: 'retain' });
    const omitted = projectAlternative(study, group.id, candidate.id, { deletionText: 'omit' });
    expect(retained.text).toBe('paramasāsibhir');
    expect(omitted.text).toBe('parasāsibhir');
    expect(omitted.markerId).toBe(group.markerId);
    expect(projectAlternativeSourceRange(omitted, { candidateId: candidate.id, ...deletion.range })).toEqual([]);
    expect(alternativeSourceRangesForText(omitted, { start: 0, end: omitted.text.length })).toEqual([
        { candidateId: candidate.id, start: 0, end: deletion.range.start },
        { candidateId: candidate.id, start: deletion.range.end, end: candidate.content.text.length },
    ]);
});

test('a real missing-text statement stays different from an explicitly empty reading', () => {
    const group = study.groups.find(group => group.candidates.some(candidate => candidate.content.annotations.some(annotation => annotation.kind === 'missing-text')))!;
    const candidate = group.candidates.find(candidate => candidate.content.annotations.some(annotation => annotation.kind === 'missing-text'))!;
    const gap = candidate.content.annotations.find(annotation => annotation.kind === 'missing-text')!;
    expect(gap.details.extentReason).toBe('omitted');
    const projection = projectAlternative(study, group.id, candidate.id, { deletionText: 'omit' });
    expect(projection.text).toBe('\uFFFC');
    expect(projection.issues).toEqual([{ code: 'missing-text', annotationId: gap.id }]);
    const empty = sample('<app><lem>base</lem><rdg/></app>').study;
    const emptyProjection = projectAlternative(empty, empty.groups[0].id, empty.groups[0].candidates[1].id, { deletionText: 'retain' });
    expect(emptyProjection.text).toBe('');
    expect(emptyProjection.runs).toEqual([]);
    expect(emptyProjection.issues).toEqual([]);
    const deleted = sample('<app><lem>base</lem><rdg><del><gap reason="illegible"/></del></rdg></app>').study;
    expect(projectAlternative(deleted, deleted.groups[0].id, deleted.groups[0].candidates[1].id, { deletionText: 'omit' }).issues).toEqual([]);
});

test('nested annotations, language resets, note markup and UTF-16 positions remain candidate-local', () => {
    const result = sample('<app><lem>A😀<del>B<del>C</del><add xml:lang="de">D</add></del>E<foreign xml:lang="">F</foreign><hi rend="italic">G</hi></lem><rdg>other</rdg><note>See <title>Work</title> in <foreign xml:lang="san">text</foreign>.</note></app>');
    const group = result.study.groups[0], candidate = group.candidates[0];
    const before = JSON.stringify(result);
    expect(candidate.content.text).toBe('A😀BCDEFG');
    const annotations = candidate.content.annotations;
    expect(annotations.find(annotation => annotation.kind === 'deletion')!.range.start).toBe(3);
    expect(annotations.some(annotation => annotation.kind === 'language' && annotation.language === '')).toBe(true);
    const german = annotations.find(annotation => annotation.kind === 'language' && annotation.language === 'de')!;
    expect(candidate.content.text.slice(german.range.start, german.range.end)).toBe('D');
    expect(annotations.find(annotation => annotation.id === german.parentId)?.kind).toBe('insertion');
    expect(projectAlternative(result.study, group.id, candidate.id, { deletionText: 'omit' }).text).toBe('A😀EFG');
    expect(group.notes[0].content.text).toBe('See Work in text.');
    expect(group.notes[0].content.annotations.map(annotation => annotation.kind)).toEqual(['work-title', 'language']);
    expect(JSON.stringify(result)).toBe(before);
});

test('candidate-local schema rejects range escapes, parent cycles and cross-content parent IDs', () => {
    const result = sample('<app><lem>a<del>b</del></lem><rdg>other</rdg></app>');
    const invalidRange = structuredClone(result.study); invalidRange.groups[0].candidates[0].content.annotations[0].range.end = 100;
    expect(AlternativesStudySchema.safeParse(invalidRange).success).toBe(false);
    const cycle = structuredClone(result.study); cycle.groups[0].candidates[0].content.annotations[0].parentId = cycle.groups[0].candidates[0].content.annotations[0].id;
    expect(AlternativesStudySchema.safeParse(cycle).success).toBe(false);
    const cross = structuredClone(result.study); cross.groups[0].candidates[0].content.annotations[0].parentId = cross.groups[0].candidates[1].id;
    expect(AlternativesStudySchema.safeParse(cross).success).toBe(false);
    expect(AlternativesStudySchema.safeParse({ ...result.study, version: '0.1' }).success).toBe(false);
    const projection = projectAlternative(result.study, result.study.groups[0].id, result.study.groups[0].candidates[0].id, { deletionText: 'omit' });
    expect(() => alternativeSourceRangesForText(projection, { start: -1, end: 0 })).toThrow();
    expect(() => alternativeSourceRangesForText(projection, { start: 0, end: 100 })).toThrow();
    expect(() => projectAlternative(result.study, result.study.groups[0].id, result.study.groups[0].candidates[0].id, { deletionText: 'unknown' as 'omit' })).toThrow();
});

test('every real selected-candidate projection has complete reversible visible mappings', () => {
    const before = JSON.stringify(study);
    for (const group of study.groups) for (const candidate of group.candidates) for (const deletionText of ['retain', 'omit'] as const) {
        const projection = projectAlternative(study, group.id, candidate.id, { deletionText });
        let cursor = 0;
        for (const run of projection.runs) {
            expect(run.start).toBe(cursor);
            expect(projection.text.slice(run.start, run.end)).toBe(candidate.content.text.slice(run.source.start, run.source.end));
            expect(alternativeSourceRangesForText(projection, { start: run.start, end: run.end })).toEqual([run.source]);
            expect(projectAlternativeSourceRange(projection, run.source)).toEqual([{ start: run.start, end: run.end }]);
            cursor = run.end;
        }
        expect(cursor).toBe(projection.text.length);
        expect(alternativeSourceRangesForText(projection, { start: 0, end: 0 })).toEqual([]);
    }
    expect(JSON.stringify(study)).toBe(before);
});
