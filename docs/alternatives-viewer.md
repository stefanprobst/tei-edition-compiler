# Alternatives in the reference viewer

Build and run from the repository root:

```sh
bun run viewer:build
bun run viewer
```

Open <http://127.0.0.1:3000/?edition=study>, or choose **Critical-edition study** in the demo navigation. **Original documents** retains the original Auden three-document reader.

## A bounded reader workflow

The study demo loads the two pinned DHARMA editions, their compiled Edition IR, the experimental alternatives extension and presentation metadata. These are generated at build time; the browser loads JSON only. Source revisions, attribution and license information remain recorded in the fixture documentation. The runtime checks the extension’s schema and exact base-artifact fingerprint before offering the experiment.

1. Open a reading under **Reading choices**. No candidate is selected initially.
2. Compare editorial-base and variant candidates, with their explicit manuscript/previous-edition witness bindings. Empty readings and marked missing text remain different evidence. Missing witness labels stay unlabelled.
3. Choose a candidate in the reading dropdown. The separate **Selected-text preview** composes only those explicit selections; unselected and unsupported entries remain marked.
4. Use **Show choice in preview** to reveal a chosen passage. Selected text is also keyboard/pointer inspectable, with source provenance and the annotated original candidate in the inspector.
5. Choose whether to retain or omit candidate deletions. The preview changes; the inspector retains the original annotated candidate. Base text uses an explicitly stated retain/source-spacing policy in this initial UI.

The two sources expose 22 and 13 represented groups respectively. A note-only parallels entry and a witness-detail assertion remain unsupported. Compiler diagnostic counts and projection-issue counts are displayed separately. Even after choosing all represented groups, the result is not a publication-ready critical reading: other scholarly structures remain diagnostic-bearing limitations.

Candidate cards preserve deletion/insertion styling, declared language evidence, missing-text markers, local intervention details and source links. Apparatus notes are shown separately from candidate text. The **Source-backed diplomatic view** remains available as a collapsible view; part and passage navigation opens it when necessary. Compiler diagnostics are likewise available without forcing a large error listing into the main reading flow.

## History and asynchronous behavior

Choices and candidate deletion policy are encoded as opaque IDs and values in the existing document/inspector URL fragment. Back, Forward and reload restore them. Inspection does not silently select a reading. Unknown, malformed or duplicate/conflicting URL selections do not become inferred choices. Internal document navigation starts that document without a selection; prior views remain available through browser history.

Projection requests use generation checks and document-ownership checks: an older result cannot overwrite a newer policy or another document. The preview is cleared while its current projection is being verified. Uploaded editions take precedence over a pending demo load. Selection controls and source text use DOM nodes/text content rather than HTML injection.

Uploaded standalone Edition JSON does not inherit either demo’s extension or presentation metadata. The current UI offers the curated study; loading arbitrary extension files or a portable edition/extension/resource bundle is a separate future task. Uploaded files remain local/in-memory and must be reopened after reload.

## Verification

The browser check exercises no-default selection, a real witness reading, Back/Forward/reload, candidate-local deletion filtering, original-source inspection, selected-passage visibility, rapid policy changes, source-view navigation, pending-load/upload ownership and mobile width. It asserts zero XML requests and zero browser runtime exceptions.

With the server running:

```sh
playwright-cli -s=tei-viewer open http://127.0.0.1:3000/
playwright-cli -s=tei-viewer run-code --filename=packages/viewer/scripts/alternatives-browser-check.js
```

The original reader keeps its separate `browser-check.js`. Typecheck, the viewer build and all 225 tests pass. This is a plain browser-API consumer of the existing contracts; neither Edition IR nor the experimental extension changes persisted shape for these controls.
