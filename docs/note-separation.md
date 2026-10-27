# Notes separated from running text

Historical first step: [IR v0.3](ir-v0.3.md) now represents supported plain and rich notes with shared annotated text. The counts and scalar bodies below describe the preceding validation.

The independent critical-edition validation exposed another semantic limit: generic traversal inserted note prose into reading text. The compiler now separates inline notes outside quarantined apparatus/choice entries. This corrects the reading boundary without adding a content tree or changing Edition IR v0.2 fields.

## Contract

A note becomes an annotation with semantic kind `note`, source provenance, containing part target and a zero-width range at its source insertion point. The range is not an inferred editorial reference span. Existing annotation containment preserves a note inside an insertion/deletion or other annotation.

Plain notes with supported attributes retain their exact text/CDATA body, including whitespace and explicit emptiness. Responsibility, certainty, source evidence, placement, classification, subtype and source label remain structured annotation data. The compiler does not infer whether a note is authorial/editorial or decode project-specific type values. Only explicitly supplied note-language attributes are copied; no language is guessed for prose in a differently declared surrounding text.

Notes with child elements or unsupported attributes/attachment rules retain a source-backed annotation, `details.contentStatus: 'uncompiled'`, no flattened body and an `unsupported-note-content` diagnostic. Their content stays in canonical TEI. This includes unsupported explicit target/reference semantics: the lexical insertion point is preserved without pretending to resolve the attachment. Supported leaf bodies use `contentStatus: 'plain-text'`.

Neither kind enters the part text. Its descendants do not become primary-text mentions, page anchors or alternative markers. Apparatus-contained notes remain governed by the separate alternatives experiment, avoiding duplicate interpretation. Ancestor range-annotation bodies containing notes now reflect their compiled text range, so inspecting a paragraph/intervention does not reinsert the removed note prose.

## Evidence and result

Across the two pinned DHARMA sources, 168 notes outside apparatus become separate annotations:

| Source | Notes | Plain bodies | Uncompiled bodies | Current compiler diagnostics |
| --- | --- | --- | --- | --- |
| Amaramālā | 127 | 123 | 4 | 60: 23 apparatus, 33 unmapped, 4 note-content |
| Sarvatathāgatatattvasaṅgraha | 41 | 41 | 0 | 16: 14 apparatus, 2 unmapped |

The four unsupported bodies contain nested emphasis markup. They are not silently flattened. The 35 represented alternative groups and two unsupported experiment entries remain the same. Both sources still fail strict compilation intentionally; fewer diagnostics do not establish publication readiness.

The Auden sources have no body notes affected by this extraction. Their text, offsets, snapshots and zero-diagnostic closed-cohort result remain unchanged. The new behavior leaves their header participant descriptions and interpretation notes alone.

## Viewer and migration

The study viewer exposes a **Notes** index grouped by owning part, with source-position ordering within each part. This is a discovery list, not an asserted global note chronology or inferred inline footnote numbering. Multiple notes at the same position remain independent records. Selecting a note exposes its body, recorded evidence and canonical source link; unsupported bodies show an explicit limitation. Zero-width anchors still use the existing containing-part fallback for passage navigation.

Notes are absent from both the source-backed diplomatic text and the selected-document preview. Deletion filtering changes reading text, not the stored note body. The ordinary annotation index also uses note body excerpts for zero-width records.

Recompile affected base editions and regenerate their alternatives extensions: text offsets and artifact fingerprints change when commentary is removed. Do not reuse a sidecar bound to the previous text artifact. Source XML bytes and selectors remain unchanged. No automatic old-JSON migration is inferred.

## Verification

Typecheck, the viewer build and all 229 tests pass; the two Auden snapshots remain unchanged. New tests cover plain/empty notes, unsupported content and attachment, explicit attribution, parent containment, surrounding text, anchor offsets, independent filtering and hash-verified source provenance across both complete real sources. Browser acceptance verifies note inspection and exclusion from both text views, rich-note feedback, existing choices/history and zero XML requests/runtime exceptions.

## Supported local attachments and note references

The [paired commentary study](paired-commentary-study.md) adds single local `corresp` attachments to explicit identified reference points, expressed as `annotates` relations. Note insertion ranges stay lexical and zero-width; no phrase span is inferred. Supported note references become `references` relations from the note, with explicit compile-time shorthand mappings where configured. Missing/unsupported attachments and unsupported reference attributes remain atomic uncompiled boundaries. Candidate content is unchanged.
