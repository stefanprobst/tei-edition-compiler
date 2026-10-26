# Text alternatives experiment v0.2

The experimental payload remains v0.2. The current base edition is [IR v0.3](ir-v0.3.md), whose notes now use the same shared annotated-text schema. Rebuild paired artifacts for the new base fingerprint.

This is the current experimental extension. The main Edition IR remains v0.2 with its existing fields and diagnostics. The [v0.1 experiment](alternatives-experiment.md) is historical: its leaf-text limitation has been tested against real mixed-content readings, rather than relaxed by flattening them.

## Source evidence and result

The same two complete, pinned DHARMA sources now yield **35 represented groups and two unsupported entries**, accounting for all 37 base-edition apparatus markers. Amaramālā contributes 22 groups and Sarvatathāgatatattvasaṅgraha contributes 13. The remaining entries are a note-only parallels entry and an explicit witness-detail assertion. Neither is forced into a candidate group. Source revisions, attribution and licensing remain in the [fixture README](../fixtures/dharma/README.md).

A manuscript reading explicitly contains `para<del>ma</del>sāsibhir`. The extension now preserves `paramasāsibhir` as candidate text and annotates `ma` as a deletion at candidate-local UTF-16 offsets. An explicit retain projection returns that text; an explicit omit projection returns `parasāsibhir` with two mappings to the surviving source ranges. The deletion is not recast as another apparatus variant.

Another candidate contains a gap whose recorded reason is “omitted.” It remains a U+FFFC missing-text marker with provenance, recorded reason and a projection issue. It does not become an empty reading. An explicitly empty candidate remains empty and has no missing-text issue.

## Content contract

Candidates and separate notes now share typed content:

```ts
content: {
  kind: 'text';
  text: string;
  language?: string;
  annotations: LocalAnnotation[];
}
```

Local annotations have independent IDs, a semantic kind, UTF-16 `{ start, end }` range, optional local parent ID, source provenance and recorded evidence. The supported kinds are deletion, insertion, language, emphasis, uncertain reading, supplied text, work title and missing text. Language spans carry an optional declared language: an empty declaration resets to unknown; a source foreign-language span without a specified language remains unknown rather than inheriting an invented language. The content-level language preserves explicit/inherited source declarations.

The compiler supports a narrow vocabulary of nested source interventions and note spans. It retains exact text/CDATA values and does not reconstruct typography from rendering tokens. Gap markers remain one source-backed position. Unsupported nested alternatives, markup, attributes or foreign-namespace content still quarantine the whole entry. Witness bindings, manuscript/previous-edition distinctions, source scoping, certainty, raw responsibility and source-reference evidence retain the v0.1 rules.

The schema requires local annotations to stay within their own content and within their local parent ranges. It rejects parent cycles, references into another candidate/note, duplicate IDs and invalid missing-text markers. Artifact verification includes these records in source-ownership and ID-collision checks. All emitted annotation selectors are verified against pinned source revisions by the regression suite.

## Explicit selection and candidate projection

The same experimental package subpath now accepts literal extension version `0.2`:

```ts
import {
  AlternativesStudySchema,
  projectAlternative,
  alternativeSourceRangesForText,
  projectAlternativeSourceRange,
} from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';

const study = AlternativesStudySchema.parse(savedStudyJson);
const projection = projectAlternative(study, selectedGroupId, selectedCandidateId, {
  deletionText: 'omit',
});
const sources = alternativeSourceRangesForText(projection, selectedTextRange);
const visibleRanges = projectAlternativeSourceRange(projection, candidateSourceRange);
```

Group and candidate IDs and the deletion policy are required. Neither candidate selection nor an editorial filtering policy is inferred. `selectAlternative` remains available for a detached copy of the annotated candidate. Projection leaves the study and base edition unchanged.

A projection returns selected text, candidate/group/marker IDs, the candidate’s original text length, explicit policy, source runs and visible missing-text issues. Its source ranges are candidate-local, not base-part offsets. Each visible run maps affinely to the original candidate text. Nested, adjacent or overlapping deletions are omitted as a union; insertion inside an omitted deletion is consequently omitted too. Gaps hidden by that explicit deletion policy do not generate visible-gap issues.

Forward and inverse helpers preserve discontinuities across removed text. Omitted and zero-width source ranges have no nonempty visible mapping. Empty candidates have no runs. Invalid offsets and unsupported policies throw. The marker ID links the selection back to its existing base-edition annotation and provenance; the one-character marker is not falsely treated as an affine coordinate system for a longer candidate.

## Scope and migration

This establishes reversible mappings for **one selected candidate**, not a whole-document reading. It does not replace markers in the base edition, move document anchors, apply base-part deletion filters or create a publication reading. Candidate-local mappings and base-document coordinates remain separate. Composing those coordinate systems under explicit document policies is the next bounded problem.

Witness-detail assertions, grouped/nested alternatives, stand-off anchoring, external witness references, broader source markup and interpreted project-specific assertions remain unsupported. The two remaining unsupported entries and the unchanged base compiler diagnostics stay visible. No chronology, authorial finality, universal normalization policy or witness preference is inferred.

Regenerate the experiment from hash-verified canonical sources. v0.1 artifacts are rejected; annotations are not guessed or filled into old JSON. An unchanged base Edition IR v0.2 artifact can still be used with its matching manifest/source revisions. Run the curated experiment with:

```sh
bun packages/compiler/scripts/alternatives-study.ts > /tmp/alternatives-study.json
```

Compiler-side extraction and artifact verification remain under `@acdh-oeaw/tei-edition-compiler/experimental/alternatives`. The verifier checks schema and structural/base-artifact binding; source-semantic guarantees come from extraction with verified source hashes, not from trusting edited sidecar text.

## Verification

Typecheck, the viewer build and all 215 tests pass; core Edition snapshots remain unchanged. Tests exercise real source deletions and gaps, nested interventions, declared language resets, note markup, UTF-16 positions, range/parent failures, empty readings and input immutability. Both retain and omit projections for every real candidate have complete ordered run coverage and forward/inverse visible mappings. This extends the existing provenance, explicit selection, source scoping and artifact-binding regressions.

## Document composition follow-up

The [selected-document projection](document-alternatives-projection.md) now composes explicit choices with separate base/candidate coordinate mappings, preserved anchors and visible unsupported/unselected markers. It is an additional runtime API; persisted extension and Edition shapes remain unchanged.
