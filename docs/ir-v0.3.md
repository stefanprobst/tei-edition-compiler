# Edition IR v0.3: shared annotated text

Historical contract, superseded by [IR v0.4](ir-v0.4.md).

IR v0.3 adds structured content to annotations so notes can use the same text-and-ranges model as reading candidates. This supersedes the [v0.2 core contract](ir-v0.2.md); its other structures and ordering rules remain in force. TEI is canonical and generated artifacts remain disposable.

## One content model

`AnnotatedTextSchema` is exported from `@acdh-oeaw/tei-edition-ir`. Its executable definition lives in `packages/ir/src/annotated-text.ts`:

```ts
AnnotatedText {
  kind: 'text';
  text: string;
  language?: string;
  annotations: LocalTextAnnotation[];
}
```

Content language preserves explicit or inherited source declarations; empty/unknown language states remain explicit, with no detection or guess.

Local annotations have IDs, a semantic kind, bounded UTF-16 ranges, optional local parent ID, provenance and recorded evidence. Supported kinds remain deletion, insertion, language, emphasis, uncertain reading, supplied text, work title and missing text. Parent references are confined to the owning content and must be contained and acyclic. IDs are unique within content and across the containing artifact. A missing-text annotation must cover its source marker.

The former experimental `AlternativeContentSchema` and `LocalAnnotationSchema` names now reference the shared schemas. They are compatibility exports, not parallel implementations. Both compiler paths use one `compileAnnotatedText` walker, and both viewer paths use one renderer and evidence display. Parts retain their established text plus edition-level range annotations; this change does not introduce a textual AST.

## Core annotation content

`Annotation` gains optional `content: AnnotatedText`. A record cannot have both `body` and `content`. Notes use `content`; `body` remains available for other established annotation kinds such as interpretations.

Compiled note content has `details.contentStatus: 'compiled'`. A note with unsupported markup or attachment rules has no content and remains explicitly diagnostic-bearing. Status/content contradictions are rejected. Local note-span IDs cannot collide with global IDs, and their provenance source must match the owning annotation. Their parent IDs remain local: they are not automatically promoted to global relation/annotation targets.

`editionProvenanceRecords(edition)` enumerates every source-backed record, including content-local annotations. Manifest validation and source verification use this traversal so provenance checks cannot silently omit note spans. Source revision hashes, selectors and note insertion-point anchors remain first-class; XML is never embedded in the IR.

## Real-source validation

All 168 notes outside apparatus in the two pinned DHARMA sources now compile into shared annotated text. The four previously uncompiled notes retain their emphasis spans and raw presentation evidence (`check`) with individual source selectors. Their text remains outside both the part text and selected-reading preview. The renderer provides a generic emphasis cue; it does not infer typography from the project token.

Current compiler diagnostics remain intentionally nonzero:

- Amaramālā: 56 — 23 apparatus entries and 33 other unmapped occurrences.
- Sarvatathāgatatattvasaṅgraha: 16 — 14 apparatus entries and two other unmapped occurrences.

The experimental alternatives payload still has version `0.2`; its content shape is unchanged. It represents the same 35 groups and reports two unsupported entries. It now binds to a v0.3 base edition. Witness-detail assertions, note-only apparatus interpretation and unsupported attachment targets remain outside this implementation.

## Migration

Recompile canonical TEI, regenerate the compilation manifest and regenerate any alternatives extension. Do not hand-edit a version literal or manufacture content arrays in saved JSON. v0.2 editions/manifests are rejected by the current validators. All source XML bytes remain unchanged.

`@acdh-oeaw/tei-edition-ir` and `@acdh-oeaw/tei-edition-compiler` advance to package version `0.3.0`. The viewer accepts IR v0.3 and reads note `content.text` and local annotations. Existing code that reads note `body` must move to structured content; other annotation body uses remain valid.

The Auden text, offsets, parts, resources and scholarly data remain unchanged. Its full snapshot changes only in the version literal; the compact revision snapshot is unchanged. Note separation itself was introduced in the preceding working phase, documented historically in [note separation](note-separation.md).

## Verification

Typecheck, viewer build and all 231 tests pass. Tests cover shared content validation, the four real emphasis spans, source inspection of nested note provenance, invalid local ranges/parents/IDs, foreign ownership, dual-body rejection, stale-version rejection, existing candidate projections and unchanged Auden data. Browser checks inspect rich notes through the shared renderer and retain both original and study workflows.

## Additional compiler evidence: diary publication

The [Schnitzler diary study](static-site-study.md) adds no IR fields. It demonstrates direct facsimile graphics as image resources, source-declared document sequence as explicit relations, restricted compile-time date-path mapping and inherited `xml:space` preservation in part text. These corrections require recompilation, not a version-literal edit or offset guessing. The separate static publisher consumes IR and manifest JSON only; publication settings remain outside core IR.

Name components compile as source-backed `name-component` annotations with `details.component` values `given-name`, `family-name` and `role-name`. They preserve source wording and do not imply entity identity. `entityDisplayName` is a derived presentation helper: it reports whether display text comes from a supplied register label, recorded mention forms or an unnamed fallback. It never populates `Entity.label` from mentions.

Optional diary person-register enrichment uses explicit `authorityLabelTypes` project mapping (empty type for the untyped preferred person name). It changes entity labels/provenance only, leaves mention wording and identity stable, and requires the complete original register as an explicit verified input. Nested descriptive bibliographies are not independent work-authority records. This adds no core IR fields.

The [paired letter/diary study](paired-commentary-study.md) represents source attachment points as zero-width `reference-point` annotations, note attachment with `annotates` relations and note document references with `references` relations. The note's lexical range is separate from its explicit attachment target; no phrase span is inferred. Project shorthand URI rules stay compile-time only. Time expressions preserve wording without inferring a clock value. These use existing v0.3 fields.

The [Akademieprotokolle study](akademieprotokolle-study.md) adds no core schema fields: meeting headings/dates map to metadata, numbers and literal abbreviation marks to source-backed annotations, and person registers reuse explicit authority identity. `documentTitlePath` is a compile-time child path with diagnostic fallback. Polygon zones and project layout stay explicitly uncompiled, with valid page resources retained; physical crops or attendance roles are not inferred.
