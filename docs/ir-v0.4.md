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
