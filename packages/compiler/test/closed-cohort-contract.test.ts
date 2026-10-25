import { expect, test } from 'bun:test';
import { EditionSchema, partLanguageRuns, documentEvents, projectDocumentText, projectSourceRange, sourceRangesForText } from '@tei-edition/ir';
import { audenMusulinMapping, compileWithManifest, createSourceIndex, verifyCompilationManifest, verifyCompilationSources } from '../src';

const fixtureManifest = await Bun.file('fixtures/auden-musulin/manifest.json').json();
const names: string[] = fixtureManifest.cohorts['interpretation-closure'];
const sources = await Promise.all(names.map(async name => ({ name, xml: await Bun.file('fixtures/auden-musulin/' + name).text() })));
const bundle = compileWithManifest(sources);
const edition = EditionSchema.parse(JSON.parse(JSON.stringify(bundle.edition)));
const manifest = verifyCompilationManifest(edition, JSON.parse(JSON.stringify(bundle.manifest)));
const indexes = new Map(sources.map(source => [source.name, createSourceIndex(source, { expectedSha256: fixtureManifest.files[source.name] })]));

test('all emitted ten-document provenance resolves against its pinned source revision', () => {
    expect(verifyCompilationSources(edition, manifest, sources)).toEqual({ verifiedSources: 10, verifiedProvenanceRecords: 8379 });
    const records = [
        ...edition.documents, ...edition.documents.flatMap(d => d.parts), ...edition.entities,
        ...edition.mentions, ...edition.relations, ...edition.annotations, ...edition.resources,
        ...edition.anchors, ...edition.diagnostics,
    ];
    for (const entry of manifest.sources) expect(indexes.get(entry.name)!.sha256).toBe(entry.sha256);
    for (const record of records) {
        const index = indexes.get(record.provenance.source)!;
        const element = index.resolve(record.provenance);
        expect(element).toBeDefined();
        expect(index.selector(element!)).toBe(record.provenance.selector);
    }
    for (const description of edition.annotations.filter(a => a.kind === 'glyph-description')) {
        expect(indexes.get(description.provenance.source)!.resolve(description.provenance)?.localName).toBe('glyph');
        expect(description.targetIds.every(id => edition.annotations.some(a => a.id === id && a.kind === 'glyph'))).toBe(true);
    }
});

test('ordered IR events reproduce the closed cohort source structure and direct text exactly', () => {
    const records = new Map([...edition.documents.flatMap(d => d.parts), ...edition.anchors].map(r => [r.id, r]));
    for (const document of edition.documents) {
        const index = indexes.get(document.provenance.source)!;
        const expected = Array.from(index.root.getElementsByTagNameNS('http://www.tei-c.org/ns/1.0', '*')).filter(e =>
            e.localName === 'pb' ||
            (e.localName === 'div' && Object.hasOwn(audenMusulinMapping.partKinds, e.getAttribute('type') || '')) ||
            Object.hasOwn(audenMusulinMapping.elementPartKinds ?? {}, e.localName)
        ).map(e => ({ kind: e.localName === 'pb' ? 'anchor' as const : 'enter-part' as const, selector: index.selector(e) }));
        const events = [...documentEvents(edition, document.id)];
        const actual = events.filter(e => e.kind === 'anchor' || e.kind === 'enter-part').map(e => ({
            kind: e.kind, selector: records.get(e.kind === 'anchor' ? e.anchorId : e.partId)!.provenance.selector,
        }));
        expect(actual).toEqual(expected);
        const stack: string[] = [], text = new Map<string, string>();
        for (const event of events) {
            if (event.kind === 'enter-part') stack.push(event.partId);
            else if (event.kind === 'exit-part') expect(stack.pop()).toBe(event.partId);
            else if (event.kind === 'text') {
                expect(stack.at(-1)).toBe(event.partId);
                text.set(event.partId, (text.get(event.partId) ?? '') + event.text);
            } else expect(stack.at(-1)).toBe(event.partId);
        }
        expect(stack).toEqual([]);
        for (const part of document.parts) expect(text.get(part.id) ?? '').toBe(part.content?.text ?? '');
    }
});

test('closed-cohort projection mappings remain reversible under every supported reading policy', () => {
    const policies = [
        { deletionText: 'retain', spacing: 'source' },
        { deletionText: 'retain', spacing: 'characters' },
        { deletionText: 'omit', spacing: 'source' },
        { deletionText: 'omit', spacing: 'characters' },
        { deletionText: 'omit', nestedDeletedParts: 'omit', spacing: 'source' },
        { deletionText: 'omit', nestedDeletedParts: 'omit', spacing: 'characters' },
    ] as const;
    const before = JSON.stringify(edition);
    const annotations = new Map(edition.annotations.map(a => [a.id, a]));
    let unmeasured = 0;
    const unmeasuredAnnotations = new Set<string>();
    for (const document of edition.documents) {
        const parts = new Map(document.parts.map(p => [p.id, p]));
        const expectedAnchors = [...documentEvents(edition, document.id)].filter(e => e.kind === 'anchor').map(e => e.anchorId);
        for (const policy of policies) {
            const projection = projectDocumentText(edition, document.id, policy);
            expect(projection.anchors.map(a => a.anchorId)).toEqual(expectedAnchors);
            let cursor = 0;
            for (const run of projection.runs) {
                expect(run.start).toBe(cursor);
                expect(run.end).toBeGreaterThan(run.start);
                expect(sourceRangesForText(projection, { start: run.start, end: run.end })).toEqual([run.source]);
                expect(projectSourceRange(projection, run.source)).toEqual([{ start: run.start, end: run.end }]);
                const sourceText = parts.get(run.source.partId)!.content!.text.slice(run.source.start, run.source.end);
                const projectedText = projection.text.slice(run.start, run.end);
                if (run.spacingAnnotationId) {
                    const annotation = annotations.get(run.spacingAnnotationId)!;
                    expect(annotation.kind).toBe('spacing');
                    expect(sourceText).toBe('\uFFFC');
                    expect(projectedText).toBe(' '.repeat(Number(annotation.details.characterCount)));
                } else expect(projectedText).toBe(sourceText);
                cursor = run.end;
            }
            expect(cursor).toBe(projection.text.length);
            let anchorOffset = 0;
            for (const anchor of projection.anchors) {
                expect(anchor.offset).toBeGreaterThanOrEqual(anchorOffset);
                expect(anchor.offset).toBeLessThanOrEqual(projection.text.length);
                anchorOffset = anchor.offset;
            }
            for (const issue of projection.issues) {
                expect(issue.code).toBe('unmeasured-spacing');
                expect(document.id).toBe('amp-transcript__0040.xml');
                expect(annotations.get(issue.annotationId)?.kind).toBe('spacing');
                expect(annotations.get(issue.annotationId)?.details.characterCount).toBeUndefined();
                unmeasured++;
                unmeasuredAnnotations.add(issue.annotationId);
            }
        }
    }
    expect(unmeasuredAnnotations.size).toBe(96);
    expect(unmeasured).toBe(288);
    expect(JSON.stringify(edition)).toBe(before);
});

test('closed-cohort language runs cover text and retain actual declaration provenance', () => {
    const annotations = new Map(edition.annotations.map(a => [a.id, a]));
    for (const document of edition.documents) for (const part of document.parts) {
        const runs = partLanguageRuns(edition, part.id);
        let cursor = 0;
        for (const run of runs) {
            expect(run.start).toBe(cursor);
            expect(run.end).toBeGreaterThan(run.start);
            expect(run.conflicted).toBe(false);
            for (const id of run.annotationIds) {
                const declaration = annotations.get(id)!;
                const source = indexes.get(declaration.provenance.source)!.resolve(declaration.provenance)!;
                expect(source.hasAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang')).toBe(true);
                expect((source.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang') ?? '').toLowerCase()).toBe((run.language ?? '').toLowerCase());
            }
            cursor = run.end;
        }
        expect(cursor).toBe(part.content?.text.length ?? 0);
    }
});
