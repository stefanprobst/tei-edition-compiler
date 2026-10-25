# TEI Edition Compiler

An experimental TEI → typed, runtime-validated Edition IR compiler. TEI/XML is canonical; generated IR is derived and disposable. Runtime consumers use semantic records, text ranges, image resources and provenance without XML tooling.

The current contract is **IR v0.2**. Documents may contain text, compound parts or photographs; they are not textual ASTs. The core contains no Auden-specific concepts.

## Install and check

Requires Bun and Node.js for TypeScript checking. Run from the repository root:

```sh
bun install
bun run typecheck
bun test
```

The repository contains two minimal packages:

- `packages/ir`: strict Zod contracts, inferred TypeScript types and XML-free consumer helpers.
- `packages/compiler`: semantic TEI extraction, declarative project profiles, source inspection and command-line tools.

## Compile, inspect and verify

Compile the three original fixtures with an integrity sidecar:

```sh
bun run compile \
  fixtures/auden-musulin/amp-transcript__0001.xml \
  fixtures/auden-musulin/amp-transcript__0040.xml \
  fixtures/auden-musulin/amp-transcript__0078.xml \
  --fail-on-diagnostics \
  --manifest /tmp/edition.manifest.json > /tmp/edition.json

bun run inspect /tmp/edition.json > /tmp/edition-review.json

bun run verify /tmp/edition.json /tmp/edition.manifest.json \
  --source fixtures/auden-musulin/amp-transcript__0001.xml fixtures/auden-musulin/amp-transcript__0001.xml \
  --source fixtures/auden-musulin/amp-transcript__0040.xml fixtures/auden-musulin/amp-transcript__0040.xml \
  --source fixtures/auden-musulin/amp-transcript__0078.xml fixtures/auden-musulin/amp-transcript__0078.xml
```

Compilation writes validated JSON to stdout. `--fail-on-diagnostics` exits 1 if diagnostics occur, while retaining complete IR and any requested manifest for review; default compilation permits diagnostic-bearing output. Fatal input or validation errors do not emit IR. Manifest destinations cannot overwrite source or profile inputs.

The inspector consumes IR alone and reports structure, entity label coverage, annotations, relations, resources and diagnostics. It does not load TEI.

Verification checks the saved edition fingerprint, every source hash and every emitted provenance selector without recompiling. Repeat `--source <manifest-name> <local-path>` for all document and authority inputs. Names match the manifest literally; local paths may have moved. The verifier reads only explicit inputs, emits JSON counts on success and exits 0. Failure emits stderr, leaves stdout empty and exits 1. Hashes establish consistency with the supplied sidecar, not authenticity or scholarly correctness.

No command implicitly fetches referenced documents, authority records or images.

## Evidence and supported scope

The fixture manifest separates three cohorts:

| Cohort | Sources | Compiler diagnostics |
| --- | --- | --- |
| Initial | 0001, 0040, 0078 | 0 |
| Baseline | Initial plus 0028, 0062 | 9 links to absent interpretations |
| Interpretation closure | Baseline plus 0009, 0012, 0031, 0043, 0053 | 0 |

Compile all ten vendored sources offline with:

```sh
bun run compile fixtures/auden-musulin/*.xml \
  --fail-on-diagnostics --manifest /tmp/closed.manifest.json > /tmp/closed.json
```

The ten-document tests verify all 8,379 emitted provenance records against pinned source revisions, ordered traversal, declared language evidence and reversible text projections. Zero compiler diagnostics remains separate from editorial uncertainty: character expansion preserves and reports 96 distinct unmeasured spacing occurrences in 0040.

Supported extraction includes compound/nested parts, photographs, correspondence and participant relations, independent entities and mentions, editorial annotations, cross-document interpretation links, responsibility attribution, declared languages, glyph descriptions and facsimile resources. Dates retain precision and offsets; unsupported or conflicting values remain text with diagnostics. Missing links and conflicting classifications remain explicit.

Entities receive canonical labels only from explicitly supplied authority records. Mention text remains occurrence evidence. The pinned upstream repository does not contain its referenced authority indexes; local authority enrichment is demonstrated with clearly synthetic data.

See [fixture provenance and licensing](fixtures/auden-musulin/README.md) and the [coverage audit](docs/coverage-audit.md). Vendored upstream XML is unchanged; images are not vendored.

## Project mappings and authorities

The default profile is [auden-musulin.json](packages/compiler/profiles/auden-musulin.json). Strict versioned JSON profiles configure division and element part kinds, entity categories, document identity, reference prefixes and authority scopes. Header extraction and editorial rules remain procedural; this is not a general mapping framework.

A separate synthetic project exercises a different structure and authority scope:

```sh
bun run compile fixtures/synthetic/generic-edition.xml \
  --mapping fixtures/synthetic/generic-mapping.json \
  --authority https://example.test/authorities.xml fixtures/synthetic/authorities.xml \
  --manifest /tmp/generic.manifest.json > /tmp/generic.json
```

## Library use

Validate loaded JSON at the runtime boundary:

```ts
import { EditionSchema, documentEvents, projectDocumentText } from '@tei-edition/ir';

const edition = EditionSchema.parse(savedEditionJson);
const document = edition.documents[0];
const events = [...documentEvents(edition, document.id)];
const projection = projectDocumentText(edition, document.id, {
  deletionText: 'omit',
  nestedDeletedParts: 'omit',
  spacing: 'characters',
});
// Inspect projection.issues before using the text as a publication reading.
```

`documentEvents` exposes ordered part boundaries, text slices and page anchors. Projections preserve source mappings and anchor positions without changing the edition. Deletion filtering requires an explicit policy; omitting embedded deleted parts requires positive containment evidence. Character spacing expansion is opt-in, with uncertain extents retained as markers and issues. These policies do not establish revision chronology or a final authorial reading.

Other IR helpers include `sourceRangesForText`, `projectSourceRange`, `partLanguageRuns` and `summarizeEdition`. They use semantic IR fields and keep source selectors opaque.

Compiler-side APIs include `compile`, `compileWithManifest`, `MappingSchema`, `MappingProfileSchema`, `CompilationManifestSchema`, `verifyCompilationManifest`, `verifyCompilationSources` and `createSourceIndex`:

```ts
import { verifyCompilationSources, createSourceIndex } from '@tei-edition/compiler';

const result = verifyCompilationSources(edition, savedManifestJson, sources);
// sources: every manifest input as { name, xml }, including authorities.
// result: { verifiedSources, verifiedProvenanceRecords }

const index = createSourceIndex(source, { expectedSha256 });
const element = index.resolve(record.provenance);
```

Source inspection belongs outside runtime consumers. `Source.uri` supplies an actual absolute source identity; source names are literal paths. The compilation library accepts optional local authorities through `compile(sources, mapping, { authorities: [{ name, uri, xml }] })`.

## Design and remaining questions

- [Current IR v0.2 contract and migration](docs/ir-v0.2.md).
- [Original evidence, interfaces and design questions](docs/ir-v0.1.md).
- [Durable project constraints](AGENTS.md).

There is no reference UI or complete TEI/revision implementation. Physical components versus intellectual works, richer revision alternatives/chronology and broader mappings need further source and consumer evidence. Runtime consumers currently use text plus semantic ranges; richer content trees remain an open question. Recompile canonical TEI to migrate older generated output rather than guessing missing order or corrected spacing offsets.
