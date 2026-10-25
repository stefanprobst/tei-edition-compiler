# Reference viewer: first consumer evidence

The local viewer in `packages/viewer` exercises the three initial documents against compiled IR v0.2. Its purpose is to find concrete consumer gaps before extending the core model. It does not establish a complete reading edition or revision chronology.

## Run

From the repository root:

```sh
bun install
bun run viewer:build
bun run viewer
```

Open <http://127.0.0.1:3000/>. `PORT` changes the local port. Rebuild and reload after source changes; there is no hot-reload framework. The generated edition, compilation manifest, browser bundle and demo presentation metadata live under ignored `packages/viewer/dist/`.

The build checks the pinned source hashes, compiles the initial cohort, verifies its provenance and bundles the browser app. The local server serves only a fixed list of generated assets. Neither browser code nor the server imports the compiler, parses XML or interprets source selectors. Compilation exists only in the build script. Uploaded Edition JSON is validated locally and replaces the current edition only after validation succeeds; a failed upload retains the current edition. No upload leaves the browser.

## Reader behavior

- 0001 displays envelope and letter text with page markers, entity mentions, editorial ranges and interpretation/contributor links in the inspector.
- 0040 displays the envelope, letter and both poem occurrences in explicit part order. Nested parts are not flattened or silently merged.
- 0078 displays the photograph resource, participant roles, setting and typed date evidence without requiring transcribed text.
- The diplomatic view retains deletions and source spacing. Inline source markers are displayed as `◇` while inspector ranges retain their original UTF-16 positions. Styling is a small selection of semantic kinds, not a claim to render every scholarly convention.
- Text is partitioned at overlapping annotation, mention and declared-language boundaries. Each marked fragment exposes all overlapping records rather than choosing a single winner. Zero-width annotations remain available in the annotation index.
- Page markers expose their linked image resources. Record inspection retains responsibility, certainty, evidence, ranges, related entities/annotations and opaque source selectors. The demo supplies links to canonical XML at the pinned upstream commit; selectors are displayed separately, never interpreted as runtime navigation instructions. Source parsing/verification remains a compiler-side task.
- Interactive fragments support Enter and Space as well as pointer input. The layout adapts to narrow screens, with the inspector below the reading view.

This is plain TypeScript and browser APIs, with only `@acdh-oeaw/tei-edition-ir` as the viewer package dependency. Text and uploaded evidence use DOM text nodes, not injected HTML; only HTTP(S) links are activated. Remote images load when their image view is visible. Image and literary rights remain distinct from the XML repository license and are displayed through attribution/document rights.

## Findings and limits

### Image service identity is not a display rendition

The fixture resource URLs identify IIIF services. The existing IR does not distinguish a displayable image URL from an image service or describe available renditions. The demo build therefore supplies explicit resource-ID → preview-URL presentation metadata. Its narrowly scoped adapter maps legacy `https://iiif.acdh.oeaw.ac.at/amp/amp_NNNN/` identities to the current `https://iiif.acdh.oeaw.ac.at/iiif/images/amp/amp_NNNN.jp2` service, using the [IIIF Image API](https://iiif.io/api/image/2.1/) full-region, aspect-preserving size request. This adapter is confined to demo build configuration. Browser code receives URLs and contains no upstream hostname, project identifier or URI-rewriting rules.

The legacy service and info endpoints checked for 0001 and 0078 returned HTTP 404 on 2026-10-25. Further investigation of the published edition identified the migrated service path. Its [0003 metadata](https://iiif.acdh.oeaw.ac.at/iiif/images/amp/amp_0003.jp2/info.json) and [0454 metadata](https://iiif.acdh.oeaw.ac.at/iiif/images/amp/amp_0454.jp2/info.json) return valid IIIF metadata with canonical service identities. The preview request uses that current path; it does not alter TEI, resource identity or recorded surface bounds. The primary “Open image” action uses the working rendition. The original URI remains explicitly labelled recorded evidence rather than promoted as a working image link.

The initial viewer incorrectly treated legacy-path failures as general upstream unavailability. A regression at the actual demo adapter now checks the migrated path and rejects unrelated or qualified resource identities. Deterministic browser success tests still use a labelled synthetic response, not a vendored facsimile; live service checks are separate. All eleven current preview requests were verified with HTTP responses and the actual photograph was decoded in the browser. No historical images are vendored.

Uploaded editions do not inherit the demo's preview or source-link mappings. Their resource URI is tried directly; service URIs may fail until explicit rendition metadata is supplied. A future core change should distinguish image services/renditions with evidence from additional consumers; this prototype does not change the persisted IR to encode a single demo's request policy.

### Occurrence labels cannot fill authority gaps

The supplied sources contain occurrence labels but omit their authority registers. The viewer shows occurrence labels in text, and explicitly unlabelled entities when canonical names are unavailable. The photograph's title and role descriptions do not become inferred authority names. Supplied authority-enriched editions can display existing entity labels directly.

### Text plus ranges supports the current reader

The current three-document view needs no content-tree extension: ordered part events plus semantic ranges preserve nested content, overlapping annotations and source positions. Native inline buttons initially disrupted text wrapping; inline elements with keyboard button behavior preserve the text flow. This was a presentation issue and required no compiler/model change.

The viewer uses diplomatic text only. It does not expose final-reading claims, reconstruct physical layout, resolve handwriting identities or infer revision sequence. The source-backed projection APIs remain available separately. Richer typography, image zones, service metadata and a full editorial policy interface need further evidence.

## Verification

`bun run typecheck` and `bun test` include model-level tests for overlapping ranges, UTF-16 offsets, explicit language spans, source markers, page-event boundaries, nontextual documents and URL handling. The browser acceptance script additionally checks document switching, both poem occurrences, exact direct-part text reconstruction, keyboard inspection, participant/setting metadata, image success/failure, source links, upload validation and mobile overflow.

With the local server running and `playwright-cli` installed:

```sh
playwright-cli -s=tei-viewer open http://127.0.0.1:3000/
playwright-cli -s=tei-viewer run-code --filename=packages/viewer/scripts/browser-check.js
```

The browser check uses synthetic network responses for deterministic image behavior, saves screenshots under `/tmp` and confirms no XML requests or browser runtime exceptions. Check upstream availability separately; a successful mocked image check is not evidence that historical facsimiles are currently reachable.

## Reader-task review

The [initial reader-task review](viewer-review.md) records the three-document walkthrough, exact passage highlighting, distinct repeated-part labels and remaining presentation/data/portability findings. No core schema change was needed.


## Browser navigation

Document changes, record selections, overlapping-evidence choices and part jumps create browser history entries. Back/Forward restore those views; demo document/record URLs can be bookmarked or reloaded. IDs are encoded as opaque URL-fragment values and validated against the active edition; no XML selectors are parsed. Repeated selections of the same view do not add duplicate entries.

Uploaded files remain in memory. Reloading loads the generated demo, so an uploaded edition must be reopened; browser history resolves only identities present in the active edition. The app does not trap Back at its first view or overwrite earlier browser history.

## Critical-edition study controls

A second demo now loads the two pinned DHARMA sources and their experimental extension. It provides explicit candidate choices, candidate deletion policy, witness/intervention inspection and a separate source-mapped preview. The original three-document demo remains available. See the [study workflow and browser checks](alternatives-viewer.md) for scope and limitations.
