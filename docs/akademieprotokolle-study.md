# Akademieprotokolle: independent edition boundary study

This is the first DSE Static validation cohort outside Auden and Schnitzler. It tests an institutional minutes edition whose evidence and presentation conventions differ from correspondence and diaries. It establishes a working partial publication path, not complete scholarly or visual parity.

## Source and licensing evidence

The [application repository](https://github.com/fun-with-editions/akademie-static/tree/5df770515413658d3970a8cbb5e329a1307fba09) identifies [acdh-oeaw/akademie-data](https://github.com/acdh-oeaw/akademie-data/tree/e070de78deee44a725c9615e83e0582d80b83ef4) as its source. Application README, fetch script and edition stylesheet were inspected separately from canonical TEI.

Pinned original cohort:

- `C_0001.xml`: philosophical-historical class meeting, 24 November 1847; six pages, participant/place mentions and many abbreviation choices.
- `A_0058.xml`: general meeting, 29 May 1852; one page and prose attendance lists with two-column rendering references.
- `listperson.xml`: the explicitly supplied original person register; 878 records, only referenced identities emitted.

The [fixture README](../fixtures/akademieprotokolle/README.md) records attribution and licensing before vendoring. The source repository has no LICENSE file and the selected TEI headers have no licence element. Its original ARCHE metadata declares CC BY 4.0 for shared repository resources, ACDH as licensor and ÖAW as rights holder; the original project description also retains an ÖAW 2020 rights statement. Both metadata files are preserved byte-for-byte as evidence and are not compiled as documents. The application software's MIT license is not substituted for data/image rights. No images are downloaded or vendored.

Every original has a SHA-256, original Git blob ID, upstream path and role in the fixture manifest. The build verifies these before compilation. The register remains an authority input, not a third document.

## Run

```sh
bun run site:prepare-akademie
bun run site:build-akademie
PORT=3014 bun packages/site/scripts/serve.ts packages/site/dist/akademie-public /akademie/
```

Open <http://127.0.0.1:3014/akademie/>. The generated site contains 89 static files. Preparation writes disposable JSON to `packages/site/dist/akademie-input/`; the JSON-only site generator writes `packages/site/dist/akademie-public/`. Existing diary and paired-letter outputs remain separate. No site/browser code imports the compiler or reads source XML.

## Preserved evidence

The two documents contain seven ordered page parts and seven page anchors linked to seven original image resources. Their shared 82 entities have 146 mentions: all 65 person identities receive names from the supplied register; 17 place identities retain explicitly marked text-form names because the place register was not supplied. All 536 emitted provenance records verify against the three original compile inputs.

A declared `documentTitlePath` selects `teiHeader/fileDesc/titleStmt/meeting`; the existing date paths select its date. Thus meaningful source meeting headings replace numeric document codes. The title path is a restricted compile-time child path, requiring exactly one nonempty element; missing/ambiguous results are diagnosed and fall back to the ordinary title. There is no meeting-specific IR type or runtime TEI expression.

The authority profile explicitly selects untyped person names, using the existing `authorityLabelTypes` mechanism. Typed alternate names are not merged into a preferred name. Source order/wording of the selected register label is preserved rather than editorially rearranged into a guessed full name. Identity is based on the declared shared authority URI scope, never spelling.

Forty `num` occurrences become source-backed `number-expression` annotations and one literal `am` outside alternatives becomes an `abbreviation-marker`. These preserve text/ranges; no numeric quantity or expanded reading is inferred. Paragraph rendering references and source resource pointers are retained as opaque evidence in annotation details. They are not instructions interpreted by runtime code.

## Unsupported evidence is visible

| Boundary | Diagnostics | Behavior |
| --- | ---: | --- |
| Abbreviation/expansion alternatives | 64 | Source-backed uncompiled markers; neither branch is concatenated or selected. |
| Surfaces containing polygonal regions/lines | 7 | Full image resources and page references remain usable, but zones/text-region alignment are explicitly uncompiled. |
| Project rendering references | 2 | One diagnostic per document; source directives remain evidence, with no inferred two-column or positional layout. |
| **Total** | **73** | Document pages show an incomplete-transcription notice near the title, markers and source-backed diagnostics. |

The six-page source has 285 zones, the one-page source 58; surface ownership is checked so nested surfaces do not double-count zones in diagnostics. Surface bounds are retained as source bounds, not reinterpreted as polygon crops.

Attendance and office roles are expressed in running prose and layout in these sources, rather than supplied as explicit structured participant assertions. The compiler preserves the text, mentions and register identities; it does not turn proximity to “Anwesende” or a heading into membership, attendance or office relations. This is a source-encoding boundary, not justification for institution-specific concepts in core IR.

One literal source graphic URL ends in `ga/Seite_NaN`. It is preserved as evidence and not repaired from a guessed document/page number. The application has a project-specific IIIF migration rule, but applying it to that identifier would not establish a correct image identity. No live image-service check or side-by-side facsimile parity is claimed by this study.

Source `xml:space` and line breaks are preserved. The generated text therefore contains source indentation and uncompiled markers rather than a reconstructed physical layout or a normalized scholarly reading. Document language remains unspecified where the TEI has no explicit declaration; a project RDF default is not silently promoted into document evidence.

## Assessment and next work

The existing v0.3 structures support source-backed pages, meeting metadata, independent entities, mentions and image resources without a genre-specific schema change. Generic mapping additions and semantic number/abbreviation annotations were sufficient for that slice. Existing manifest verification and the same static publisher worked with a different authority corpus and document structure.

The study also demonstrates that a generic reader is not full edition parity. The next semantic work should evaluate abbreviation/expansion candidates under explicit reading policy, independently from polygon/image anchoring and project layout. The source zone geometry should not be approximated as rectangles merely to fit the current image schema. Attendance inference requires additional explicit evidence; it should not be smuggled into name extraction.

Local full-text search, physical-layout fidelity, image-service adaptation, complete geographic authority enrichment, production accessibility and corpus-scale performance remain separate publication checks.

## Verification

Unit/integration tests cover all original source and licensing-evidence bytes, title/date mapping and fallback, register identity reuse, literal number/abbreviation annotations, absence of inferred participant relations, exact diagnostic categories, retained source image identifiers and all generated links/fragments at root and non-root base paths.

```sh
playwright-cli -s=tei-site open http://127.0.0.1:3014/akademie/
playwright-cli -s=tei-site run-code --filename=packages/site/scripts/akademie-browser-check.js
```

Browser checks cover meeting-date filtering, source headings, prominent incomplete-reading notice, marker visibility, shared-person backlinks, Back/reload, retained original image URI, mobile width and JavaScript-free reading. No XML/JSON requests or runtime exceptions occur. Image links are inspected without requesting facsimiles. Desktop/mobile screenshots are inspected separately.
