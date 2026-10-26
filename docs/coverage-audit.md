# Interpretation-dependency coverage audit

This audit extends real-source evidence beyond the original vertical slice. It uses the same [pinned amp-data commit](https://github.com/Auden-Musulin-Papers/amp-data/tree/289a52de61aef0b6354e3c8298173bf1f889feb2/data/editions), 289a52de61aef0b6354e3c8298173bf1f889feb2. Attribution and licensing are recorded in the [fixture README](../fixtures/auden-musulin/README.md); headers and upstream bytes remain unchanged. Images and external authority indexes were not downloaded or vendored.

## Separate test cohorts

The fixture manifest now records these explicit cohorts:

| Cohort | Documents | Expected compiler diagnostics |
| --- | --- | --- |
| initial | 0001, 0040, 0078 | 0 |
| baseline | initial plus 0028, 0062 | 9 unresolved interpretation occurrences |
| interpretation-closure | baseline plus 0009, 0012, 0031, 0043, 0053 | 0 |

The five-document baseline deliberately excludes interpretation context and keeps its existing snapshots and missing-context tests. The ten-document cohort proves resolution through supplied sources, without suppression or implicit fetching. Ordinary external document references remain external; this is interpretation dependency closure, not a claim that every referenced corpus document is included.

## Inputs and provenance

The baseline's nine unresolved occurrences point into 0009, 0012, 0031 and 0053. Adding those sources resolves all nine, while 0031 introduces one additional interpretation reference to 0043. Including 0043 closes the chain for this selected set.

Downloaded bytes were checked against their Git blob identities in the pinned upstream tree. All five context documents were then recorded with attribution before vendoring; their SHA-256 values are:

| Source under data/editions | SHA-256 | Selection evidence |
| --- | --- | --- |
| amp-transcript__0009.xml | 404fec377170acf657a9d137f7e676de54ebd6216846e3d5f089daa74bb7461b | Address-line regression and interpretation context |
| amp-transcript__0012.xml | 2e4367e53f560e0e31ec5e615e1aff74a0a86d6b23ca3bf886a718e5ce63cf28 | Interpretation context |
| amp-transcript__0031.xml | 77a3670f195e9163db6677b225da081dd6e9f889e13d66c165e4f19de75f2420 | Interpretation context; exposes dependency on 0043 |
| amp-transcript__0043.xml | 94eb57b9ad0918c1892a4acb6f199a351c0ba049ac844c675f62f5da5f7cb3ec | Work-title, postscript and glyph regression; final interpretation dependency |
| amp-transcript__0053.xml | 45dd44a5399f230d45709318b928a1c71937b4ed35ec215a14d523a1a4459059 | Interpretation context |

These are full unmodified TEI sources, not hand-extracted interpretations. They compile through the normal pipeline and contribute their own documents, metadata, parts, resources, annotations and references.

## Mapping discoveries

0009 contains a postal address-line element. The compiler previously traversed its text but diagnosed the missing semantics. It now emits an address-line range annotation and separates adjacent lines. An explicit following line break is retained once, avoiding an invented blank line.

0043 adds a body work title, a postscript and a declared glyph. These become work-title, postscript and glyph annotations. The glyph's supplied literal reading remains in the text. A glyph-description annotation carries the declaration's source description and targets its occurrences. Shared declarations resolve across supplied documents and aliases without duplication.

An empty glyph reading emits a source-backed marker and an unrendered-glyph diagnostic; description prose is not decoded into a character. Missing declarations preserve literal readings and explicit external annotation targets. The implementation does not claim general Unicode-mapping, font or character-declaration support beyond the evidenced subset.

These mappings use existing v0.2 fields and the open semantic annotation vocabulary. No project-specific concepts were added to the IR core. The original five-document text, offsets, parts and snapshot output are unchanged.

## Verified result

The complete cohort passes the normal CLI with diagnostic failure enabled and produces a matching compilation manifest:

    bun run compile fixtures/auden-musulin/*.xml --fail-on-diagnostics --manifest /tmp/edition.manifest.json > /tmp/edition.json
    bun run inspect /tmp/edition.json > /tmp/edition-review.json

Observed totals:

- documents: 10
- parts: 51
- textLength: 188677
- entities: 448
- mentions: 1565
- relations: 169
- annotations: 5794
- resources: 171
- anchors: 171

Compiler diagnostics: zero. Runtime projection issues and editorial reading policies remain separate concerns; zero diagnostics does not imply a complete revision model, fully labelled authority records or universal TEI support.

The offline dependency-closure integration test verifies successful strict-mode compilation, all input hashes, manifest binding, document/part/anchor counts and the absence of external annotation targets. New unit regressions preserve actual address/title/postscript/glyph evidence and test missing/empty/shared glyph cases. The full suite passes 231 tests plus TypeScript checking.


## Closed-cohort runtime contract verification

The verification now covers the complete ten-document cohort through a JSON serialization boundary. All 8,379 emitted provenance records resolve against source indexes initialized with the pinned hashes. Independent source traversal matches structural part/anchor events, part boundaries stay balanced, and direct part text reconstructs exactly.

The tests exercise all six valid named deletion/nested-part/spacing policy combinations at the default spacing limit. Every projected run maps forward and backward to its original part range; expanded spaces map to their single source occurrence. Output runs have complete ordered coverage, all anchor identities survive at valid monotonic positions, and the source edition remains unchanged. Declared language runs cover each text-bearing part and retain the actual language declaration provenance.

Zero compiler diagnostics remains distinct from editorial uncertainty. Character-expansion policies each report the same 96 unmeasured spacing annotations in 0040; those source extents are preserved rather than assigned invented counts. The remaining nine documents have no projection issues under the tested combinations. The runtime report therefore identifies 96 distinct uncertain spacing occurrences even though their reports recur in three character-expansion policy views.

These are validation and regression improvements: no persisted IR shape, production behavior, source bytes or baseline snapshots changed. Projection expansion-limit boundaries and unsupported cases remain covered by the existing targeted tests.
