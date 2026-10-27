# Paired letter and diary: linked commentary

The next DSE Static validation slice pairs the original Schnitzler letter `L02549.xml` with the three pinned diary entries for 9–11 June 1909. The letter's original XML and repository license are preserved byte-for-byte, with attribution, commit, SHA-256 and Git blob IDs in [its fixture directory](../fixtures/schnitzler-letters/README.md).

## Run

```sh
bun run site:prepare-pair
bun run site:build-pair
PORT=3013 bun packages/site/scripts/serve.ts packages/site/dist/paired-public /pair/
```

Open <http://127.0.0.1:3013/pair/> and select Olga Schnitzler's letter. Follow note 1, its diary reference, then Back and the source-attachment backlink. Note 2 retains the French wording and its source language annotation. The diary-only study and optional authority-enriched build remain separate outputs.

Preparation verifies all original bytes and emitted selectors, writes disposable JSON under `packages/site/dist/paired-input/`, and builds 38 static files under `packages/site/dist/paired-public/`. All four documents compile with zero diagnostics; 168 emitted provenance records verify against the four originals. No authority registers are supplied by this preparation, so entity names use the explicitly explained text-form fallback. The shared authority scopes are a deliberate combined-project mapping, not matching by names.

## What the real TEI changed

The initial letter compile reported two uncompiled notes, two unmapped anchors and an unmapped time expression. The notes point to separate anchors before “morgen Donnerstag” and “tan mieux,” rather than declaring ranges over those phrases.

- Empty identified `anchor` elements with the supported simple attributes become `reference-point` annotations at explicit zero-width part positions. They are separate from facsimile/page anchors.
- A note's single local `corresp` ID (with or without `#`) resolves to a compiled reference point after source indexing. An explicit `annotates` relation connects the note to the point. The note's own lexical insertion position remains unchanged; no phrase span, range end or direction is inferred.
- A supported note `ref` becomes an explicit `references` relation whose subject is the note. Its text remains in note content; an empty reference remains empty. The publication shows the resolved document title separately beside the note, rather than inserting an invented date into source prose.
- The letter's empty diary reference uses a project-specific type and a date-shaped target. The declared `documentReferenceRules` map its type to an absolute diary document URI. The supplied diary target resolves internally; without that source it remains an explicit external URI. Unknown types retain ordinary URI behavior and invalid configured shorthand produces a diagnostic.
- The time expression becomes a source-backed `time-expression` annotation. Its literal wording is retained; no exact clock time or timezone is inferred.

These use existing IR v0.3 structures; there is no XML AST, new runtime TEI dependency or IR schema change. Native HTML links connect source points, notes and documents, including without JavaScript. The site now displays source date wording alongside encoded values, retaining `[9. 6. 1909?]` rather than hiding the uncertainty in the label.

## Declarative shorthand rule

The combined fixture mapping contains:

```json
{
  "documentReferenceRules": {
    "schnitzler-tagebuch": {
      "prefix": "https://id.acdh.oeaw.ac.at/schnitzler/schnitzler-tagebuch/editions/entry__",
      "suffix": ".xml",
      "targetKind": "date"
    }
  }
}
```

This is compile-time project vocabulary. Runtime consumers receive resolved IDs/URIs and semantic relations only. Supported target kinds are complete validated Gregorian dates (`YYYY-MM-DD`) and bounded simple identifiers. Prefixes are absolute URIs without query/fragment; suffixes are restricted literal filename characters. This is not arbitrary XPath, regex substitution or a general template framework. The preparation supplies explicit document URIs for each edition instead of applying one edition base to all sources.

## Conservative boundaries

Only one local identified point is supported for note attachment in this slice. Missing points, multiple attachment tokens, external attachment scopes and unsupported attachment attributes remain diagnosed and uncompiled. Bodies and references are staged together: a failed note never leaks partially compiled relations. Note references with unsupported responsibility, certainty, language or other attributes remain uncompiled instead of discarding those semantics. Existing candidate-content handling is unchanged; reference callbacks are used only by core note compilation.

Reference relations belong to the note as a whole. The current shared annotated-text model does not represent link-local ranges; the site consequently presents document references next to note content. Richer inline link placement needs separate evidence and model work.

The original graphic identifiers resolve as document image resources under the source's explicit XML base, with page pointers matching them. They are not claimed to be working image-service rendition URLs. No facsimile URLs were guessed, fetched or vendored. General image-service adaptation, full typography, geographic metadata, complete register enrichment and full-text search are still outside this slice.

The two correspondence dates retain their source labels and explicit encoded values as separate assertions. The site deduplicates identical display strings only; it does not rewrite dates or infer certainty from punctuation.

## Verification

Compiler tests verify original fixture bytes, all provenance selectors, separate note prose, point attachment before the note's lexical position, French language annotation, time-expression wording, cross-edition resolution and the unsupplied-target boundary. Synthetic tests cover forward attachment references, missing/multiple/unsupported targets, atomic failures, unsupported note-reference attributes and shorthand validation. Generated-link checks cover the paired site at root and under `/pair/`.

With the local server running:

```sh
playwright-cli -s=tei-site open http://127.0.0.1:3013/pair/
playwright-cli -s=tei-site run-code --filename=packages/site/scripts/paired-browser-check.js
```

Browser checks pass point-to-note navigation, note-to-diary links, Back, attachment backlinks, second-note content, fragment reload, source date wording and mobile width. A JavaScript-disabled context verifies linked commentary too. No XML/JSON requests or runtime exceptions occur; desktop/mobile screenshots are inspected separately.
