# Legal Kraus: first complexity assessment

Source: [D_000196-084-000.xml](https://github.com/karl-kraus/legalkraus-data/blob/bc279c5e9a2b20be2777a5558f1348c18b2da79c/data/editions/D_000196-084-000.xml), repository revision `bc279c5e9a2b20be2777a5558f1348c18b2da79c`, inspected 2026-10-30. Title: 196.84 Äußerung des Privatklägers zum Schriftsatz der Angeklagten vom 18. Februar 1936. Editor Alexandra Rausch; publishers ACDH-CH/ÖAW, Ludwig Boltzmann Institut für Digital History and Wienbibliothek im Rathaus. The file header declares CC BY 4.0. The repository license API returned 404; that does not override the explicit file-level declaration. Image rights require separate inspection.

The initial assessment read original bytes in temporary storage only. The follow-up boundary slice now vendors the unchanged XML under `fixtures/legalkraus/`, with attribution, a pinned manifest and a strict project profile; no images or registers are vendored. SHA256: `903d0a60a9b8ce238b68c03c675e90be2980ccefa4a443f5a0b98d7bce7ef39b`.

## Evidence

- Two declared witnesses point to two facsimile groups, with 56 and 43 surfaces respectively. There are 99 graphics and 99 page markers. The body has a long direct text followed by an untyped nested division containing 43 page markers. The structure needs explicit witness/part binding, not automatic alignment by ordinal image position.
- 371 additions, 297 deletions, 172 substitutions and 13 restorations. Every restoration is inside a deletion; additions/deletions/substitutions also nest. Removing all deletion ranges would erase explicitly restored text. This is a revision-semantics boundary, not merely styling.
- Four hand declarations carry witness sources, scribe pointers, media, certainty and responsibility. Hand identity, scribe identity and editorial attribution must stay distinct. A hand pointer alone is not authorship or revision chronology.
- One transposition declaration, two segment targets and two transposition metamarks. `#D_000001-001-000_seg002` resolves, but `#D_000001-001-000_seg001` does not; the corresponding first segment is actually identified as `D_000196-084-000_seg001`. Preserve this mismatch; no fuzzy repair or implicit reordering.
- 109 marginal notes, 981 entity-reference elements, 156 quotations, and source pointers to other case documents and Fackel passages. References and marginalia are not running text or inferred legal participant roles.
- No apparatus or choice elements occur. This principally tests documentary revisions, witness/material structure and cross-references, not our experimental apparatus selection API.

## Read-only compiler baseline

A deliberately incomplete mapping selected body as transcript, mapped person/institution/work/place reference types and retained law as unknown. An explicit full document Source.uri was supplied. No authority documents or missing sources were loaded. This is not yet a verified project mapping: bare PMB IDs remain document-scoped pending evidence for the project authority scope.

The current compiler emits one document/one part, 99 resources, 99 anchors, 957 mentions, 170 entities and 109 note records. Source/selector verification passes. It emits 22 diagnostics: 21 unmapped-content and one entity-kind-conflict (the same scoped reference is classified as organization and work). It finds no document dates under this minimal mapping; the explicit creation evidence is a produced sorting date bounded by `notAfter-iso="1936-04-23"`, not the 2022 publication date.

These counts do not establish semantic support. In particular, generic traversal retains restoration words but loses restoration semantics, witness structure is flattened into one part, and header transposition/hand assertions are not represented adequately. A low diagnostic count is not evidence of a faithful edition.

## Recommended bounded next slice

First vendor the unchanged licensed source with revision, attribution and hashes. Add a reproducible project profile and boundary tests for the two witness/facsimile groups, restoration nested in deletion, explicit hand evidence and the unresolved transposition pointer. Keep unsupported revision semantics visibly uncompiled/diagnosed; do not expose a final-reading projection. Establish safe preservation before expanding the IR with a revision graph or implementing reordering. Resolve authority scope and local document-pointer conventions from supplied project evidence before enriching entities or following case links. No whole-corpus import is needed for this first case.

## Implemented boundary slice

The profile explicitly maps `body` to transcript and untyped `div` to a nested text section. `elementPartKinds.div` is an explicit fallback when no declared `partKinds` type rule matches; typed rules retain precedence. This preserves the 56/43 page cohorts as two related parts without assigning witness roles. The two witness resource bindings and four scribe-bearing hand declarations are retained as source-backed `uncompiled-assertion` annotations, with raw pointers, medium, responsibility and certainty rather than guessed identities or alignment.

Restoration subtrees, transposition segments and transposition metamarks become atomic `uncompiled-content` markers. Their source selectors and raw pointer evidence survive; their text is not mistaken for an interpreted reading. The header transposition declaration stays an uncompiled assertion with the original target list. Nested content is not partially materialized. No revision chronology, source repair or transposition is performed. Generic structural `seg` content without transposition semantics remains unchanged.

The new boundary artifact has two parts, 99 resources/anchors, 956 mentions, 170 entities and 109 marginal notes. One mention inside an unsupported restoration is intentionally not partially compiled. The produced date is an open-start interval ending 1936-04-23, selected from explicit creation evidence. All 3,307 provenance records verify against the pinned XML. There are 35 diagnostics: two unsupported witness bindings, four unsupported hand attributions, five unsupported transpositions, thirteen unsupported restorations, one conflicting entity kind, six remaining unmapped quotation elements and four unresolved responsibility tokens. The authority scope and hand contributors remain deliberately unresolved without supplied registers.

This is an incomplete source-preserving boundary, not final-reading support. Deletion-excluding projections must not be interpreted as the edition’s intended reading: they cannot model restoration or revision chronology. Next work should establish source-backed witness/part bindings and contributor/register scopes, then design restoration selection with reversible mappings and explicit policies. Do not replace markers with ordinary insertion annotations or infer which witness is preferred.
