# Full Auden–Musulin publication pilot

The pilot publishes all 73 edition documents at amp-data commit `289a52de61aef0b6354e3c8298173bf1f889feb2`, enriched with five explicitly supplied registers at amp-entities commit `c40710c90054e8adef5188a5168c09adb7d5c824`. These separately pinned revisions do not constitute a claim about the current enlarged Auden in Austria Digital release. Inventory, attribution, license distinctions and original-byte hashes are recorded in [the corpus lock](../corpora/auden-musulin/README.md). Original XML remains canonical and unchanged.

## Reproduce

```sh
bun run amp:fetch
bun run amp:audit
bun run amp:build
bun run amp:verify
# Two clean local builds, no downloads
bun run amp:reproduce
# Optional explicit network check: HEAD requests only, no image bodies
bun run amp:check-resources
PORT=3018 bun packages/site/scripts/serve.ts packages/site/dist/amp-public /amp/
```

Fetching verifies the locked size, SHA256 and Git blob identity. Compilation reads only those local inputs. The audit emits validated edition/manifest JSON, publication settings and an audit report into ignored `packages/site/dist/amp-input/`. The static generator consumes JSON alone and emits 709 files into `packages/site/dist/amp-public/`. It does not inspect XML or fetch sources. Static HTML supports direct navigation and reading without JavaScript; local search requires JavaScript and WebCrypto on HTTPS or localhost.

## Verified scope and remaining evidence

The artifact contains 73 documents, 626 entities, 2,352 mentions and 364 image resources. All 78 source inputs and 13,508 provenance records verify against the original bytes. Of 620 supplied entity labels, 617 come from registers and three from document contributor definitions. Six referenced authority records remain unavailable: their full identities and cross-scope evidence are retained in `corpora/auden-musulin/audit-baseline.json`. “Name unavailable” means no canonical label was supplied for that exact authority identity; occurrence wording is still available separately as written.

One compiler diagnostic remains: responsibility token `tfruehwrith` in document 0002. It is not silently corrected to a similarly spelled contributor. Document 0003 declares the XML ID `amp-transkript__0015.xml`; an explicit inventory Source.uri preserves its canonical file identity and resolves incoming links without changing the declared ID. No basename or fuzzy identity matching is used. Sixteen external relation occurrences remain actual foreign destinations; supplied document targets resolve internally.

Compilation required evidenced mappings for column boundaries, an explicit local glyph-reference alias and restricted authority label child paths. Column boundaries remain source-backed zero-width annotations, not inferred layout. The glyph alias preserves raw pointer evidence and literal readings. Place label selection excludes containing-country names. The two unchanged upstream regression documents live in a separate publication fixture cohort.

The reading/search policy retains deleted text and source spacing. A separate opt-in character-spacing audit exposes 271 unmeasured-spacing issues; a clean default projection does not mean editorial certainty. Search uses literal case-insensitive matching with flexible whitespace, preserves reverse ranges into IR parts and links to the containing source part. It does not produce a normalized final reading. The index is bound to the edition fingerprint, deployment path and its exact page-declared SHA256.

All 364 preview URLs returned HTTP 200 with image content types during the explicit HEAD check at 2026-10-28T06:26:31.333Z. This is a dated service-availability check, not image-content verification. The project preview adapter maps the recorded legacy service identifiers to current image URLs without modifying IR resource identities. Browser preview tests use a labelled synthetic image; historical images are not vendored.

## Reader-task comparison

This is a functional comparison with a DSE Static Cookiecutter publication, not a visual reproduction or a claim of complete feature parity.

| Reader task | Pilot status |
| --- | --- |
| Browse the complete pinned edition | All 73 documents, content-kind/date/title filtering, stable file routes |
| Read primary texts and compound objects | Ordered semantic parts, source interventions and page/column markers |
| Inspect photographs | Participants, roles, setting/date, facsimile resources |
| Follow scholarly commentary | In-text markers, commentary, certainty/responsibility and backlinks |
| Inspect registers and occurrences | Supplied names, explicit missing labels, exact occurrence backlinks |
| Search primary transcriptions | Local literal search, explicit reading policy, query history and source-part links |
| Open facsimiles | Image/text workspace, explicit selection, lazy previews, page-marker return links |
| Inspect provenance and rights | Pinned source links, identifiers, credit and diagnostic pages |
| Follow stable URLs without JavaScript | Document/entity routes and anchors; tested at root and `/amp/` |
| Original site styling, essays, team and imprint | Not ported; pilot About page records scope and attribution |
| Deep zoom, synchronized image/text, maps, rich biographies | Not implemented |
| Faceted hosted search or normalized editorial readings | Not implemented |

Validation: 289 unit tests and TypeScript checking pass. Static verification checks 27,580 internal links, duplicate IDs, provenance inventory and search reverse mappings. Browser checks cover both deployment paths, direct reload, Back navigation, commentary/image/entity backlinks, mobile width, no-JavaScript reading and absence of XML requests/runtime errors. Desktop and mobile screenshots were visually inspected.

The next useful phase is a reader review of this complete pilot: compare concrete reading and discovery tasks with the source publication, prioritize the gaps above, and only then invest in visual design or deeper image interaction. The compiler boundary is already exercised across the full pinned corpus.

## Reader review follow-up

Task review identified and fixed lost document/entity filter state on navigation, missing reading-policy guidance on direct document links, and visually crowded page markers. Filters now use a shareable `filter` query parameter, restore on Back/reload, and announce result counts. Every page has a keyboard skip link and visible focus styles. Direct document pages explain retained deletions, source spacing and source markers. Page-marker spacing is presentation-only and never changes source text.

The review remains a developer task walkthrough, not a user study. The image/text workspace below addresses the next priority; clearer hierarchical part headings remain for reader review; deeper image interaction should follow reader feedback. Unknown image dimensions remain unknown instead of being fabricated. No source, IR semantics or editorial choices changed during this usability pass. Review rules: [Web Interface Guidelines](https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md).

## Image/text workspace

Document pages with explicitly configured preview URLs offer a progressive image/text workspace. “View image” at a page marker opens exactly that linked resource; resource cards also offer “Read beside transcription”. The selector lists supplied resources and records source page labels when present. Unlinked resources remain marked as having no supplied page link. Resource-list order does not imply page alignment.

The `image` URL parameter contains a stable publication resource anchor, validated against the page’s rendered options. Selection, closure, reload and Back/Forward restore the panel without changing transcription or source coordinates. Modified clicks retain the normal resource-card fragment destination. No image is selected automatically. Unknown query values stay closed. Only explicit publication preview URLs can load into the workspace. Desktop shows sticky side-by-side panes; mobile stacks them. Keyboard controls, status/error feedback, a direct image link and close-focus restoration remain available. No-JavaScript users retain ordinary resource cards, image previews and page backlinks.

The workspace is intentionally a basic image reader: no crop inference, scroll synchronization, automatic page selection, IIIF manifest fetching or deep zoom. The browser module reads rendered semantic resource settings only. No XML/compiler code enters its bundle. The corpus artifact/provenance baseline remains unchanged; the new browser asset raises output to 709 files.

## Part hierarchy and navigation

“In this document” is a nested list of stable part links derived from IR containment and document reading events. Headings reflect the same nesting (including accessible levels beyond HTML’s six heading elements), and nested parts have a restrained visual border. Labels format recorded semantic kinds without inventing document titles. Links remain native fragments, preserving selected-image query state and working without JavaScript. The compound document 0040 is a regression test for envelope, letter and attached poem nesting, unchanged IR and valid anchors.

## Source marker inspection

Diamond markers in the transcription are native links to a source-marker inspection entry. Each entry retains all covering spacing, missing-text, glyph or uncompiled-content annotations, their recorded bodies/details, provenance and a full annotation link. Explicit marker-position IDs include the existing part anchor and UTF-16 position; a return link targets that exact occurrence. Unknown extents remain unknown and glyph readings are never inferred. Marker links are separate from surrounding entity links, preventing nested anchors. Browser fragment navigation reveals the containing details element without JavaScript, and the selected image query remains intact. This is publication presentation only: IR source text, ranges, diagnostics and fingerprints remain unchanged.

## Shared structured-note presentation

The static publisher now renders structured note bodies using the same XML-free annotated-text run planner as the reference viewer. Source characters and UTF-16 ranges remain unchanged; supported deletion, insertion, emphasis, supplied text, work titles, abbreviation markers and superscript receive semantic styles. Only explicit language declarations affect language spans; empty declarations reset to unknown and conflicting equal-priority declarations remain unknown with a visible explanation. Missing-text diamonds link to their local annotation evidence. Local certainty and recorded detail fields remain inspectable.

The full pinned Auden artifact contains no structured inline-note bodies, so this check uses the original supplied Schnitzler letter (its explicit French phrase in a note) plus a synthetic rich-note regression. No fixture bytes or compiler support boundaries change. In particular unsupported note extent attributes remain diagnostic-bearing rather than being silently accepted. The viewer’s independent abbreviation/expansion study also passes its browser regression after sharing the planner.

## Reproducibility checkpoint

`bun run amp:reproduce` compiles twice from the pinned local cache and builds two fresh temporary publication directories. Each pass verifies every source hash/selector and the publication baseline. It compares SHA256 digests for all 709 emitted files plus edition, manifest, audit and publication-settings JSON: 713 files in total. The dated optional image-availability report is validated for exact resource identities, source/preview URLs and HEAD method, but is not regenerated or included in the deterministic comparison. No sources or images are fetched. Temporary output is removed after review checks, including on failure; the ordinary public preview directory is not replaced. Derived compilation inputs are regenerated.

Both clean builds matched byte-for-byte at the 2026-10-29 checkpoint. The strengthened publication check also asserts register/contributor label counts, external destination counts and both projection issue baselines. This establishes a reproducible local publication milestone, not a production deployment or a completed user study.

Remaining release work: reader feedback on the complete pilot, project-specific essays/imprint and visual identity, and a deployment decision. Deep zoom, synchronization, maps, richer register biographies and normalized readings remain explicitly out of scope for this milestone. The original one unresolved responsibility and six missing authority labels stay source issues requiring editorial evidence.
