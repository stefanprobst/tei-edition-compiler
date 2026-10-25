# Text alternatives experiment v0.1

Historical proposal: the [current v0.2 experiment](alternatives-experiment-v0.2.md) adds candidate-local annotations and explicit text projections. Recompile the extension from verified sources; the current experimental API rejects v0.1 artifacts.

This is an executable proposal, separate from the main Edition IR v0.2 contract. It tests explicit alternatives against two complete, pinned and attributed real sources. It does not promote apparatus support to the normal compiler or remove its diagnostics. The [preceding validation](second-edition-validation.md) and [fixture provenance](../fixtures/dharma/README.md) describe the source evidence.

## Evidence that shaped the proposal

Amaramālā supplies one manuscript witness and 22 lemma/variant pairs plus a note-only apparatus entry. Sarvatathāgatatattvasaṅgraha supplies a manuscript and two previous editions, 14 apparatus entries and 19 variant readings. Its candidates can themselves contain deletions, and one entry has an explicit witness-detail assertion. Those are different semantic layers; previous editions are not silently counted as additional manuscripts, and a deletion within a candidate is not another apparatus candidate.

The experiment compiles **31 groups**: 21 from Amaramālā and 10 from Sarvatathāgatatattvasaṅgraha. **Six entries remain unsupported** with source-backed diagnostics. They include marked-up notes, nested reading interventions and a witness-detail assertion. All 37 existing quarantine markers are accounted for exactly once. The extension materializes four referenced witness records: two manuscripts and two previous editions. The second manuscript has an empty source siglum and therefore no invented label.

The source’s lemma is recorded as an `editorial-base` role, following its explicit encoding. That role does not establish an original, final or automatically preferred reading. See the TEI definitions of [lemma](https://tei-c.org/release/doc/tei-p5-doc/en/html/ref-lem.html) and [reading](https://tei-c.org/release/doc/tei-p5-doc/en/html/ref-rdg.html). Raw editorial classifications such as `emn` remain evidence; no project token is decoded into a universal editorial claim.

## Proposed contract

Executable schemas live in `packages/ir/src/experimental/alternatives.ts`, exported only through `@acdh-oeaw/tei-edition-ir/experimental/alternatives`.

| Record | Semantic fields |
| --- | --- |
| Study | literal version `0.1`, base edition SHA-256, witnesses, groups, unsupported-entry diagnostics |
| Witness | independent ID, manuscript/edition/unspecified kind, optional declared label, provenance |
| Group | ID, existing marker ID, two or more mutually exclusive candidates, separate notes, evidence, provenance |
| Candidate | ID, editorial-base/variant role, text content and optional declared language, witness IDs, evidence, provenance |
| Note | ID, separate text and optional declared language, evidence, provenance |
| Evidence | raw responsibility tokens, source references, optional certainty and descriptive details |

A group contains at most one explicitly encoded editorial base; zero is allowed. Empty candidate text is valid and retained. Two candidates may cite the same witness: competing assertions are not resolved automatically. Unresolved witness tokens cause the entire entry to remain unsupported. IDs are source-scoped; equal local fragments or sigla in different documents never merge.

Each group anchors to an existing single-character source marker in the diagnostic-bearing base edition. Candidate text is not inserted into that base text. The extension’s provenance covers group, candidate, note and witness declarations. The strict schemas reject duplicate IDs, dangling witnesses, multiple editorial bases and repeated/conflicting marker coverage.

## Compile and consume

Reproduce the curated experiment offline from the repository root:

```sh
bun packages/compiler/scripts/alternatives-study.ts > /tmp/alternatives-study.json
```

The script verifies pinned fixture hashes, compiles the base edition, verifies supplied source revisions/provenance and emits the experimental extension. Its stderr summary distinguishes supported groups from unsupported entries. It is an experiment runner, not a general publication command; the base edition remains diagnostic-bearing.

Library APIs:

```ts
import {
  compileAlternativesStudy,
  verifyAlternativesStudy,
} from '@acdh-oeaw/tei-edition-compiler/experimental/alternatives';

const study = compileAlternativesStudy(validatedEdition, compilationManifest, sources);
const boundStudy = verifyAlternativesStudy(validatedEdition, savedStudyJson);
```

`compileAlternativesStudy` requires all manifest inputs explicitly. It checks the edition/manifest binding and exact source hashes before extraction. It resolves local witness references against supplied declarations and never fetches registers or external files. `verifyAlternativesStudy` checks the extension schema, edition fingerprint, marker coverage, source ownership and reference categories against the base edition. It verifies structural binding, not the authenticity of a saved extension or the truth of its scholarly assertions; it does not re-read sources or prove an edited candidate string matches them. Recompiling from hash-verified sources supplies the source-inspection guarantee.

Runtime consumers require no compiler, XML DOM or source-selector parsing:

```ts
import {
  AlternativesStudySchema,
  selectAlternative,
} from '@acdh-oeaw/tei-edition-ir/experimental/alternatives';

const study = AlternativesStudySchema.parse(savedStudyJson);
const candidate = selectAlternative(study, selectedGroupId, selectedCandidateId);
// candidate.content.text and candidate.witnessIds are semantic data.
```

Both IDs must be explicitly supplied. There is no implicit first candidate, lemma preference or witness preference. Selection returns a detached copy and does not mutate the study or base edition. This experiment exposes one candidate’s text; it does not yet project a document reading or remap source ranges through replacements of different lengths.

## Deliberately unsupported

- Readings or notes with child elements, including deletions, uncertain readings, language spans and glyphs. They are not flattened.
- Grouped/nested candidates, witness-detail assertions and free text between candidates.
- Stand-off anchoring, external witness pointers and undeclared witnesses.
- Choice-group normalization/correction policies, reconstruction of chronology or a final reading.
- Rich witness descriptions, resolved contributor identities and interpreted project-specific classification tokens.
- Publication-ready whole-document selection, replacement mappings and viewer selection controls.

The plain-text subset preserves exact leaf text and explicit/inherited language declarations. It does not apply source rendering instructions such as hyphen placement; those instructions remain recorded details. This is not a complete diplomatic rendering of each candidate.

## Consequence for the main model

The experiment establishes that separate candidates, explicit witness assertions and marker anchoring can be consumed without XML vocabulary. It does **not** establish that a leaf-text candidate model is sufficient: the second source already contradicts that broader claim. Before adoption, decide how candidate-local ranges/annotations represent nested interventions and how selected text maps back to the source marker and candidate provenance. Resolve that concrete issue before adding a full apparatus viewer or choosing a new Edition IR version.

Typecheck and all 210 tests pass. Nine new experiment tests cover both real sources, every emitted source selector, explicit selection, omitted/empty/neutral readings, source scoping, unsupported structures, strict schema/binding failures and changed source revisions. Existing Edition snapshots are unchanged.
