# Experimental selected-document projection

The [alternatives experiment v0.2](alternatives-experiment-v0.2.md) now composes explicitly chosen candidate text into a derived document view. Edition IR and the alternatives extension keep their existing versions and persisted shapes. Neither source artifact is rewritten.

## API and binding

```ts
import {
  projectDocumentAlternatives,
  selectedSourceRangesForText,
  projectSelectedSourceRange,
} from '@acdh-oeaw/tei-edition-ir/experimental/document-alternatives';

const projection = await projectDocumentAlternatives(
  edition, study, documentId,
  [{ groupId: chosenGroupId, candidateId: chosenCandidateId }],
  { deletionText: 'retain', candidateDeletionText: 'omit' },
);
```

The API requires a selection list and separate base/candidate deletion policies. It also accepts the existing optional nested-deleted-part and spacing policies. There is no implicit lemma, first candidate or witness preference. Duplicate, unknown or foreign-document selections fail. Selection order does not determine reading order.

The function validates and snapshots both inputs before yielding. It hashes the exact edition snapshot using Web Crypto and the same canonical JSON representation as the compiler, then validates marker coverage and structural ownership. A study bound to another artifact is rejected. This requires Web Crypto, available in secure browser contexts including localhost. It imports no compiler, XML tooling or Node crypto implementation. Structural binding still does not authenticate edited sidecar content or establish scholarly correctness.

## Two source coordinate systems

Every visible run maps to one discriminated source range:

- `kind: 'part'`: original base-part ID and UTF-16 range;
- `kind: 'candidate'`: group/candidate/marker IDs and candidate-local UTF-16 range.

`selectedSourceRangesForText` maps a search/highlight interval back to those ranges, including discontinuities. `projectSelectedSourceRange` maps visible intersections forward. Expanded base spacing retains its existing non-affine source-marker mapping; candidate deletion gaps retain their discontinuous mappings.

Replacement bookkeeping is deliberately separate. Each explicit choice records its base marker range and either an applied output span or an excluded status. A selected empty reading has an applied zero-width span. The base marker character itself has no character-to-character mapping to a longer candidate: its non-affine replacement span is in `choices`, while inserted text maps to candidate source ranges. This distinguishes anchoring from textual origin.

## Policy and structure

Base policies are applied first using the existing document projection. A marker removed by a base deletion or an omitted embedded subtree cannot be resurrected by a candidate choice. That choice is recorded as excluded. Candidate-local deletion filtering is independent and applies only when the candidate is inserted.

Nested part spans and page-anchor positions are remapped through all replacements, preserving source identity, original source offsets and event order. Boundaries before a marker stay before the inserted candidate; boundaries after it move after the candidate. Empty selections collapse adjacent boundaries without deleting their records. Overlapping markers and markers transformed by a conflicting spacing policy are rejected rather than ordered arbitrarily.

Visible supported groups without selections retain their marker and report `unselected-alternative`. Unsupported entries retain their marker and report `unsupported-alternative`. A selected visible gap reports its candidate-local missing-text issue. Existing base projection issues remain present, and compiler diagnostics stay on the unchanged edition.

## Verification and limits

The tests cover longer and empty replacements, UTF-16 text, mixed source mappings, anchor and nested-part positions, deleted markers/subtrees, independent candidate filtering, expanded spacing, invalid bindings/selections and caller mutation during asynchronous verification. Complete real-source document projections preserve ordered anchors and reversible visible mappings, with selection-order independence. Photograph documents still work without textual alternatives.

Typecheck and all 223 tests pass. The core Edition snapshots remain unchanged. This is a policy-driven experimental text projection, not a publication-ready critical edition. Unsupported notes, witness-detail assertions, external references, broader apparatus structures and source rendering rules remain as documented in the earlier validation. The [reference viewer study demo](alternatives-viewer.md) now offers explicit selection controls for this extension.

A browser-only bundle was also checked against the real Sarvatathāgatatattvasaṅgraha artifact. Web Crypto accepted the compiler’s fingerprint, the explicit `rājāhaṁ` choice appeared at its recorded replacement span, and all 2,136 anchors survived. The other visible entries remained explicit: 12 unselected groups and one unsupported entry produced 13 issues. This check loaded only the IR runtime module and JSON artifacts; compiler/source inspection stayed outside the browser.
