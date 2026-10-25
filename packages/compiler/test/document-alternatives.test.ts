import { expect, test } from 'bun:test';
import { projectDocumentAlternatives, selectedSourceRangesForText, projectSelectedSourceRange } from '@acdh-oeaw/tei-edition-ir/experimental/document-alternatives';
import { compileWithManifest, MappingProfileSchema } from '../src';
import { compileAlternativesStudy } from '../src/experimental/alternatives';
import { fingerprintJson } from '../src/fingerprints';

function sample(body: string) {
    const source = { name: 'document.xml', xml: '<TEI xmlns="http://www.tei-c.org/ns/1.0"><teiHeader><title>Projection</title></teiHeader><text><body>' + body + '</body></text></TEI>' };
    const bundle = compileWithManifest([source], { partKinds: { embedded: 'embedded' }, elementPartKinds: { body: 'text' }, entityKinds: {} });
    return { ...bundle, study: compileAlternativesStudy(bundle.edition, bundle.manifest, [source]), documentId: bundle.edition.documents[0].id };
}
const policies = { deletionText: 'retain', candidateDeletionText: 'retain' } as const;
const choices = (s: ReturnType<typeof sample>, candidate = 0) => s.study.groups.map(group => ({ groupId: group.id, candidateId: group.candidates[candidate].id }));

test('selected document text preserves mixed source mappings, empty choices and structural boundaries', async () => {
    const s = sample('A<pb n="before"/><app><lem>😀long</lem><rdg>x</rdg></app><pb n="after"/><div type="embedded">B<app><lem/><rdg>empty alternative</rdg></app>C</div>D');
    const before = JSON.stringify(s);
    const p = await projectDocumentAlternatives(s.edition, s.study, s.documentId, choices(s), policies);
    expect(p.text).toBe('A😀longBCD');
    expect(p.anchors.map(anchor => anchor.offset)).toEqual([1, 7]);
    expect(p.parts.find(part => part.partId === s.edition.documents[0].parts[1].id)).toMatchObject({ start: 7, end: 9 });
    expect(p.choices[1]).toMatchObject({ status: 'applied', range: { start: 8, end: 8 } });
    let cursor = 0;
    for (const run of p.runs) {
        expect(run.start).toBe(cursor);
        expect(selectedSourceRangesForText(p, run)).toEqual([run.source]);
        expect(projectSelectedSourceRange(p, run.source)).toEqual([{ start: run.start, end: run.end }]);
        cursor = run.end;
    }
    expect(cursor).toBe(p.text.length);
    expect(projectSelectedSourceRange(p, { kind: 'part', ...p.choices[0].source })).toEqual([]);
    expect(JSON.stringify(s)).toBe(before);
});

test('base deletions suppress choices and candidate deletion policy remains independent', async () => {
    const s = sample('A<del><app><lem>hidden</lem><rdg>other</rdg></app></del>B<app><lem>x<del>y</del>z</lem><rdg>other</rdg></app>C');
    const p = await projectDocumentAlternatives(s.edition, s.study, s.documentId, choices(s), { deletionText: 'omit', candidateDeletionText: 'omit' });
    expect(p.text).toBe('ABxzC');
    expect(p.choices[0].status).toBe('excluded');
    const retained = await projectDocumentAlternatives(s.edition, s.study, s.documentId, choices(s), { deletionText: 'omit', candidateDeletionText: 'retain' });
    expect(retained.text).toBe('ABxyzC');
});

test('nested deleted parts keep collapsed anchors without resurrecting selected candidates', async () => {
    const s = sample('A<del><div type="embedded"><pb/><app><lem>hidden</lem><rdg>other</rdg></app></div></del>B');
    const p = await projectDocumentAlternatives(s.edition, s.study, s.documentId, choices(s), { deletionText: 'omit', nestedDeletedParts: 'omit', candidateDeletionText: 'retain' });
    expect(p.text).toBe('AB');
    expect(p.choices[0].status).toBe('excluded');
    expect(p.anchors[0].offset).toBe(1);
    expect(p.parts[1].start).toBe(p.parts[1].end);
});

test('spacing transformations retain non-affine mappings alongside candidate mappings', async () => {
    const s = sample('A<space quantity="3" unit="char"/><app><lem>long</lem><rdg>x</rdg></app><pb/>B');
    const p = await projectDocumentAlternatives(s.edition, s.study, s.documentId, choices(s), { ...policies, spacing: 'characters' });
    expect(p.text).toBe('A   longB');
    expect(p.anchors[0].offset).toBe(8);
    const spacing = p.runs.find(run => run.spacingAnnotationId)!;
    expect(selectedSourceRangesForText(p, { start: 2, end: 3 })).toEqual([spacing.source]);
    expect(projectSelectedSourceRange(p, spacing.source)).toEqual([{ start: 1, end: 4 }]);
});

test('unselected and unsupported entries stay marked and candidate gaps remain issues', async () => {
    const s = sample('<app><lem>a</lem><rdg>b</rdg></app><app><note>only note</note></app><app><lem><gap reason="omitted"/></lem><rdg/></app>');
    const p = await projectDocumentAlternatives(s.edition, s.study, s.documentId, [choices(s)[1]], policies);
    expect(p.text).toBe('\uFFFC\uFFFC\uFFFC');
    expect(p.issues.map(issue => issue.code)).toEqual(['missing-text', 'unselected-alternative', 'unsupported-alternative']);
});

test('binding and invalid selections fail before producing a selected document', async () => {
    const s = sample('<app><lem>a</lem><rdg>b</rdg></app>');
    const selected = choices(s);
    await expect(projectDocumentAlternatives(s.edition, s.study, s.documentId, [...selected, ...selected], policies)).rejects.toThrow('Duplicate');
    await expect(projectDocumentAlternatives(s.edition, s.study, s.documentId, [{ ...selected[0], candidateId: 'missing' }], policies)).rejects.toThrow('Candidate');
    await expect(projectDocumentAlternatives(s.edition, s.study, s.documentId, [{ ...selected[0], groupId: 'missing' }], policies)).rejects.toThrow('Unknown alternative');
    const changed = structuredClone(s.edition); changed.documents[0].metadata.title = 'Changed';
    await expect(projectDocumentAlternatives(changed, s.study, s.documentId, selected, policies)).rejects.toThrow('does not match');
    const p = await projectDocumentAlternatives(s.edition, s.study, s.documentId, [], policies);
    expect(() => selectedSourceRangesForText(p, { start: -1, end: 0 })).toThrow();
    const conflict = structuredClone(s.edition);
    const marker = conflict.annotations.find(annotation => annotation.kind === 'uncompiled-content')!;
    conflict.annotations.push({ ...structuredClone(marker), id: 'spacing-conflict', kind: 'spacing', details: { characterCount: '2' } });
    const conflictStudy = { ...s.study, editionSha256: fingerprintJson(conflict) };
    await expect(projectDocumentAlternatives(conflict, conflictStudy, s.documentId, selected, { ...policies, spacing: 'characters' })).rejects.toThrow('transformed');
    const snapshotProjection = projectDocumentAlternatives(s.edition, s.study, s.documentId, selected, policies);
    s.edition.documents[0].metadata.title = 'Caller mutation during verification';
    s.study.groups[0].candidates[0].content.text = 'Caller mutation';
    expect((await snapshotProjection).text).toBe('a');

});

test('real-source document selections preserve mappings and anchors under explicit policies', async () => {
    const names = ['DHARMA_CritEdAmaramalaBLBurnell436e.xml', 'DHARMA_CritEdSarvatathagatatattvasangraha.xml'];
    const sources = await Promise.all(names.map(async name => ({ name, xml: await Bun.file('fixtures/dharma/' + name).text() })));
    const mapping = MappingProfileSchema.parse(await Bun.file('fixtures/dharma/mapping.json').json()).mapping;
    const bundle = compileWithManifest(sources, mapping), study = compileAlternativesStudy(bundle.edition, bundle.manifest, sources);
    const before = JSON.stringify({ bundle, study });
    for (const document of bundle.edition.documents) {
        const selected = study.groups.filter(group => group.provenance.source === document.provenance.source).map(group => ({ groupId: group.id, candidateId: group.candidates.find(candidate => candidate.role === 'variant')!.id }));
        const p = await projectDocumentAlternatives(bundle.edition, study, document.id, selected, { deletionText: 'retain', candidateDeletionText: 'omit' });
        expect(p.choices.every(choice => choice.status === 'applied')).toBe(true);
        let cursor = 0;
        for (const run of p.runs) {
            expect(run.start).toBe(cursor);
            expect(selectedSourceRangesForText(p, run)).toEqual([run.source]);
            expect(projectSelectedSourceRange(p, run.source)).toEqual([{ start: run.start, end: run.end }]);
            cursor = run.end;
        }
        expect(cursor).toBe(p.text.length);
        expect(p.anchors.map(anchor => anchor.anchorId)).toEqual(bundle.edition.anchors.filter(anchor => document.parts.some(part => part.id === anchor.partId)).map(anchor => anchor.id));
        for (let index = 1; index < p.anchors.length; index++) expect(p.anchors[index].offset).toBeGreaterThanOrEqual(p.anchors[index - 1].offset);
        const reversed = await projectDocumentAlternatives(bundle.edition, study, document.id, [...selected].reverse(), { deletionText: 'retain', candidateDeletionText: 'omit' });
        expect(reversed.text).toBe(p.text);
        const foreign = study.groups.find(group => group.provenance.source !== document.provenance.source)!;
        await expect(projectDocumentAlternatives(bundle.edition, study, document.id, [{ groupId: foreign.id, candidateId: foreign.candidates[0].id }], policies)).rejects.toThrow('another document');
    }
    expect(JSON.stringify({ bundle, study })).toBe(before);
}, 20_000);

test('documents without textual alternatives still support empty image-only content', async () => {
    const source = { name: 'photo.xml', xml: await Bun.file('fixtures/auden-musulin/amp-transcript__0078.xml').text() };
    const bundle = compileWithManifest([source]);
    const study = compileAlternativesStudy(bundle.edition, bundle.manifest, [source]);
    const p = await projectDocumentAlternatives(bundle.edition, study, bundle.edition.documents[0].id, [], policies);
    expect(p.text).toBe(''); expect(p.runs).toEqual([]); expect(p.anchors).toHaveLength(1);
});
