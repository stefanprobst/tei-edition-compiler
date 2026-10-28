# Open compiled artifacts in the viewer

Run `bun run viewer:build` and `bun run viewer`, then open <http://127.0.0.1:3000/>. Expand **Open compiled artifacts** and select files by role:

1. Edition JSON (required): validated IR v0.4.
2. Compilation manifest (required): produced with the compiler's `--manifest` option.
3. Alternatives extension (optional): experimental v0.3, compiled for that exact edition.
4. Presentation metadata (optional): version 1, described below.

Press **Open artifacts**. File names are arbitrary; the viewer does not discover companion files. Files are read locally in the browser. XML is neither uploaded nor loaded. All supplied artifacts must validate before the current edition is replaced. A failed load preserves the current edition, reading choices and presentation metadata. Omitting either optional file clears its previous contents.

The manifest check validates its structure, the canonical JSON edition fingerprint and the provenance source inventory, including document roles. Alternatives must match that fingerprint and the edition's marker anchors. Presentation metadata must match the fingerprint and refer only to known source names and resource IDs. This path uses the browser-safe `@acdh-oeaw/tei-edition-ir/compilation-manifest` entry point; source inspection remains in the compiler.

These checks establish consistency among supplied JSON artifacts. They do not verify source XML bytes, the mapping fingerprint against a local mapping, authenticity, scholarly correctness or the contents of linked URLs. For source hashes and selector verification, use the compiler verifier with every explicit local input:

```sh
bun run verify /tmp/edition.json /tmp/edition.manifest.json \
  --source original-source.xml /path/to/original-source.xml
```

Match each manifest source name literally; repeat `--source` for all document and authority inputs. See the root README for compilation and verification examples.

## Presentation metadata v1

Presentation metadata supplies attribution, canonical source links and optional image preview overrides. It does not alter canonical resource URIs or provenance. All fields are required; URL maps may be empty. Source-link keys are literal `manifest.sources[].name` values; preview keys are `edition.resources[].id` values. Values must be absolute HTTP(S) URLs. Extra fields and unknown keys are rejected.

This Bun example creates a valid empty presentation file from an existing manifest, without copying a placeholder fingerprint:

```ts
const manifest = await Bun.file('/tmp/edition.manifest.json').json();
await Bun.write('/tmp/presentation.json', JSON.stringify({
  version: '1',
  editionSha256: manifest.editionSha256,
  attribution: 'Supply the edition attribution and applicable rights here.',
  sourceLinks: {},
  previews: {},
}, null, 2));
```

Add explicit source and preview URLs to the maps as needed. A matching fingerprint binds the metadata to an edition; it does not prove a URL serves the correct revision or image. Remote images can be requested when their view is visible; source links open only when followed.

The header's separate **Open Edition JSON** control remains a quick schema-only inspection path. It clears companion metadata and reports that artifact binding was not checked. Neither loading mode persists user files: reload restores a built-in demo, and local files must be reopened. History navigates within the active edition.

## Acceptance check

The independent, project-authored fixture exercises loading outside the built-in demos:

```sh
bun packages/viewer/scripts/prepare-artifact-check.ts
playwright-cli -s=tei-viewer open http://127.0.0.1:3000/
playwright-cli -s=tei-viewer run-code --filename=packages/viewer/scripts/artifacts-browser-check.js
```

It checks optional alternatives, preview and source links, failed-load preservation, clearing omitted metadata, malformed JSON, mobile width, zero XML requests and zero browser runtime errors. Synthetic preview responses are test assets, not historical facsimiles.

Older v0.3 editions and v0.2 alternatives must be recompiled; see the [v0.4 migration contract](ir-v0.4.md).
