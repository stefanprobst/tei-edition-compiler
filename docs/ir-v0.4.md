# Edition IR v0.4: abbreviation marks and superscript

TEI/XML remains canonical. IR v0.4 extends the shared annotated-text vocabulary with two source-backed local annotation kinds: `abbreviation-marker` and `superscript`. All other core v0.3 structures, ranges, ordering rules, manifests and separation of documents/entities/mentions remain in force. Text alternatives remain a separate experiment, not a core textual AST.

The real Akademieprotokolle choices contain literal abbreviation marks and superscript letters inside abbreviated forms. Treating those as ordinary text alone would lose their semantics; calling a superscript generic emphasis would misstate the source's explicit rendering instruction. The shared compiler walker now maps `am` to an abbreviation marker, and `hi` with the exact known `rend` values `super` or `superscript` to semantic superscript. Other supported `hi` declarations retain existing emphasis/evidence behavior. This mapping is compile-time; consumers receive semantic kinds and do not interpret TEI tokens.

Both kinds have the existing local ID, bounded UTF-16 range, optional parent, source provenance and scholarly evidence. Literal marker characters are retained, including punctuation and dashes. No expansion is inferred from a marker; no raised letter becomes a footnote link. Superscript retains the literal character sequence and nesting, and the shared viewer renderer applies its semantic style. Supported rich notes and experimental candidates use the same annotated-text schema/walker/renderer.

## Versions and migration

- Core edition: `version: "0.4"`; IR/compiler workspace packages: `0.4.0`.
- Experimental alternatives: `version: "0.3"`, bound to an exact v0.4 edition fingerprint. See [its contract and real-source checks](alternatives-experiment-v0.3.md).
- Compilation manifest and presentation metadata retain their existing version 1 shapes; manifests identify the new IR version and fingerprints change with recompilation.

Recompile original TEI and explicitly supplied authorities with the recorded mapping. Regenerate the manifest, alternatives extension and presentation metadata for that exact artifact. Do not edit saved version literals or reuse an old edition fingerprint. The viewer explicitly rejects v0.3 editions and v0.2 alternatives; no guessing/migration of annotation kinds or reading roles occurs at runtime.

The main Auden snapshot changes only its version literal. The shared local vocabulary enables more precise note/candidate evidence without changing base text, source bytes or the base alternative markers. Core compilers continue to emit markers and diagnostics for alternatives; the experiment does not erase them.

## Full-corpus publication evidence

The [full Auden pilot](auden-publication-pilot.md) requires no new structural IR version. Source-backed `column-boundary` annotations preserve column labels without layout inference. Project mappings may declare explicit glyph-reference aliases and restricted authority label child paths; raw evidence remains preserved. Entity display helpers classify labels as `supplied`, since authoritative labels can come from a supplied register or contributor definition; occurrence-text fallbacks remain separate and explicitly as written. Explicit Source.uri inventory identities resolve file/root-ID discrepancies without modifying canonical bytes or guessing identities. Publication routing, previews and search stay outside core semantics.

## Annotated-text presentation runs

`annotatedTextRuns` provides a shared pure presentation plan for validated structured note/candidate content. Runs retain local UTF-16 boundaries, original text and covering annotations. Explicit language declarations follow their parent graph and bounded specificity; conflicting equal-priority declarations expose `languageConflict` and reset the run to unknown. The static HTML publisher and reference DOM viewer adapt the same plan without XML dependencies or inferred readings. This helper adds no serialized IR fields and requires no version change.
