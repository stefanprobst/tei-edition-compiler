# Edition IR v0.2 — explicit document order

Status: experimental; current compiler output and runtime schemas use the literal version `0.2`. The [v0.1 design](ir-v0.1.md) records the first slice, evidence and remaining constraints. TEI remains canonical and generated IR remains disposable. This revision addresses a consumer-visible ambiguity without introducing a UI, XML runtime or generic mapping framework.

## Evidence and contract change

In v0.1, a nested part's `parentOffset` and a page anchor's `offset` locate both within parent text, but cannot determine their relative order at the same position. For example, a page anchor before an empty embedded part and one after it all have offset zero. The separate parts and anchors arrays cannot resolve that tie. Recovering it from source selectors would violate the runtime boundary.

Both `Part` and `Anchor` now require `order: number`: a nonnegative safe integer, unique across those two collections within one document. The compiler assigns values during source traversal, starting with zero per document. Gaps are allowed, and the values are not stable identities across source edits. All other v0.1 fields retain their shapes and meaning.

```ts
Part { id; kind; order; parentId?; parentOffset?; content?;
       resourceIds; provenance }
Anchor { id; partId; order; offset; resourceIds; label?; provenance }
```

Offsets remain half-open JavaScript UTF-16 positions in each part's own text. Nested content is never duplicated into the parent text. Intentional whitespace/line breaks remain content when they affect positions; discarded XML indentation follows the existing text policy. Empty photographs still need no textual content.

The edition validator checks unique document-local order values, source-tree-compatible part/anchor order, and nondecreasing offsets among a part's direct children and anchors. A child or anchor cannot precede its parent or reopen a subtree after traversal has left it. Existing reference, range, provenance and cycle constraints still apply. Storage array order is not used to infer reading order.

## Minimal runtime consumer

`documentEvents(edition, documentId)` is an exported generator in `@acdh-oeaw/tei-edition-ir`. Pass a schema-validated edition; unknown document IDs throw a clear error. It emits:

- `enter-part` and `exit-part`, with `partId`.
- `text`, with `partId`, `start`, `end` and the text slice.
- `anchor`, with `partId` and `anchorId`.

The iterator indexes direct child parts and anchors, merges them using explicit order, slices parent text at their offsets, and visits nested parts in place. Every part boundary and anchor occurs once; concatenating text events for a part reproduces that part's emitted content exactly. Event text slices can be intersected with existing annotation/mention ranges. Annotation rendering, reading-text policies and document layout remain consumer choices.

```ts
import { EditionSchema, documentEvents } from '@acdh-oeaw/tei-edition-ir';
const edition = EditionSchema.parse(JSON.parse(json));
for (const event of documentEvents(edition, edition.documents[0].id)) {
  // Consume semantic events; no XML, namespaces or selector parsing.
}
```

The helper imports no compiler or XML dependency. It proves the runtime contract with a small, useful consumer instead of adding a reference UI. It is a diplomatic content-order iterator, not an inferred chronology of revisions or a renderer.

## Migration

Recompile canonical TEI with the current compiler. Do not simply relabel v0.1 JSON as v0.2 or invent order values by concatenating the two collections: the necessary relative ordering was absent. The v0.2 schema rejects v0.1 payloads and records missing required order values. Package versions are `0.2.0`; source fixtures, attribution and checksums are unchanged. Existing IDs, text, offsets, resources and scholarly assertions remain unchanged except that whitespace-only content is now retained when it contributes offsets. Snapshot changes add the version/order fields.

The v0.1 design notes remain historical; their array-order tie-break description is superseded by this explicit ordering contract. Broader revision graphs, full authority-record ingestion, calendar mappings, mapping languages and reference UI work remain deferred. A small optional authority-label path is documented below.

## Verification

Tests compare structural events against independent source traversal across all five fixtures, check balanced part boundaries and exact text reconstruction, and verify zero-offset interleaving, whitespace positions, serialized IR, reordered storage arrays, opaque provenance and invalid ordering graphs. The complete initial-fixture snapshot now records v0.2 and explicit order. Existing diagnostics remain nine interpretation pointers to sources outside the fixture set.

## Optional supplied authority records

The compiler accepts `compile(documents, mapping, { authorities })`. Each authority input has `{ name, uri, xml }`, with an explicit absolute document URI and a unique source name. It is parsed as canonical TEI through the same source index, but is not emitted as an edition document. Only entities already referenced by documents are enriched; unused register records do not create entities. No authority is fetched implicitly.

The initial procedural importer recognizes register entries directly under `listPerson`, `listPlace`, `listOrg`, `listEvent` and `listBibl`: respectively `person/persName`, `place/placeName`, `org/orgName`, `event/label` and `bibl/title`. Records require `xml:id`. Record identity is the full supplied authority URI plus fragment, matched against the canonical entity authority URI. An unrelated URI with the same fragment does not match.

One distinct nonempty direct label is required for enrichment. Structured name components are joined with normalized spacing; nested names in descriptions are not label candidates. Multiple equivalent labels are deduplicated. Multiple distinct labels receive `ambiguous-authority-label` and stay unset; missing labels, missing IDs and unsupported register shapes receive explicit diagnostics. Preferred-name selection, multilingual names and broader authority schemas need real register evidence before generalizing.

A matched record supplies entity provenance (the authority record's selector) and, when unambiguous, the display label. Mention labels, ranges, IDs and provenance remain unchanged. Existing entity IDs remain unchanged. Authority classifications can supplement unknown occurrence types; contradictions produce `authority-kind-conflict` and leave the entity kind unknown. Entity `resolution: 'external'` continues to mean an external authority reference, even when a local supplied copy provides a label: the IR is not claiming to materialize the whole authority record. This uses existing v0.2 fields and does not change the IR schema.

The CLI accepts repeatable `--authority <absolute-uri> <local-file>` arguments. Duplicate source names, duplicate authority URIs and fragment-bearing authority document URIs are rejected. Local paths are not guessed to be authority identities.

The pinned `amp-data` tree contains index references but no matching authority files. Tests therefore use the clearly identified project-authored [synthetic register](../fixtures/synthetic/README.md), not fabricated Auden–Musulin authority records or unpinned live data. The five upstream fixtures, their checksums and the no-authority output snapshots are unchanged. Actual project register enrichment remains dependent on explicitly supplied, appropriately attributed authority inputs.

Authority tests cover all five supported record kinds, exact URI matching, occurrence/authority provenance separation, referenced-only enrichment, ambiguous and missing labels, kind conflicts, source-identity rejection and end-to-end CLI use.

## Scholarly responsibility attribution

Runtime attribution now uses explicit relations with predicate `responsible-for`, a person entity as `subjectId`, and the scholarly annotation ID in `objectIds`. These relations appear in the owning document's `relationIds`. The annotation's original `responsibility` tokens remain evidence; application consumers should traverse the semantic relations rather than interpret source-local editor identifiers.

Contributor definitions come from named people under header editor/author/responsibility statements, or directly named editor/author elements. A single explicit external `ref` supplies identity; a contributor with an XML ID but no external identifier uses a source-document URI plus fragment. Bare responsibility IDs are source-local. Fragment and document-qualified references resolve through supplied source indexes, and absolute identifiers resolve only against supplied contributor definitions or explicit local person-authority inputs. The compiler does not fetch a person record or correct near-matching IDs. Missing/non-contributor targets produce `unresolved-responsibility` with the binding's source provenance.

Only referenced contributors are materialized. Canonical identities deduplicate repeated appearances across headers; equal local IDs in unrelated documents do not merge without a shared canonical identity. Labels come from contributor definitions, not mention text. Distinct supplied labels for one identity stay unset with `contributor-label-conflict`; contradictory classifications receive `contributor-kind-conflict`. Explicit supplied authority enrichment still applies afterward. Contributor entity provenance identifies the definition, while each attribution relation points to the direct responsibility attribute owner or nested responsibility element. Equivalent pointers do not create duplicate relations.

The pinned fixtures themselves provide evidence for this path: 15 interpretation records carry three responsibility references apiece. They produce 45 attribution relations to Sandra Mayer, Timo Frühwirth and Dimitra Grigoriou, identified by the ORCID URIs in the TEI headers. No extra mentions or authority documents are invented. This adds three referenced person entities and attribution relations to corpus output; existing text, part order, anchors and raw responsibility evidence are preserved. The complete initial-fixture snapshot has been updated for the additional semantic records. IR remains v0.2 because all records use existing entity/relation fields and an open predicate vocabulary.

Tests cover source-local and cross-document IDs, canonical identity deduplication, direct and nested responsibility statements, duplicate pointers, missing/non-contributor targets, conflicting labels, locally identified contributors, explicit authority records, and all 45 corpus attributions. Existing corpus diagnostics remain the nine links to absent interpretation sources.

## Explicit text projections

`projectDocumentText(edition, documentId, { deletionText: 'retain' | 'omit' })` provides a derived plain-text view using only validated IR. The policy is required. Retain mode concatenates ordered content events; omit mode subtracts the union of nonempty `deletion` annotation ranges within each part. Adjacent, nested and overlapping exclusions are applied once. Inserted text survives unless it is itself inside an excluded deletion range. The original edition, text, annotations and provenance are never mutated. This helper adds no persisted fields and does not change the v0.2 schema.

The returned `TextProjection` contains:

- `text`: concatenated selected text. Source mode adds no separators or normalization; optional character-spacing expansion is described below.
- `runs`: projected half-open ranges paired with original part ranges. Copy runs have equal lengths; explicit spacing-expansion runs map all generated characters to one source occurrence, identified by `spacingAnnotationId`.
- `anchors`: every anchor in content order, with its projected offset and original part/offset. Anchors inside omitted text survive at the collapsed position.
- `parts`: projected subtree spans, including empty parts and their nested content. These spans are not claims that all text in the span belongs directly to that part.
- `issues`: `deletion-crosses-part-boundary` when an exclusion touches the insertion point of an embedded part, including boundary coincidences.

Offsets are UTF-16 throughout. `projectSourceRange(projection, partRange)` maps nonempty visible intersections into projected ranges. Wholly omitted or zero-width source ranges map to an empty array. `sourceRangesForText(projection, { start, end })` maps search/highlight offsets back to part ranges, preserving gaps caused by omissions and changes in part ownership. Empty projected ranges return no text ranges; anchors are mapped separately. Projected requests outside the result text or malformed numerical ranges are rejected. The resulting part ranges lead back through ordinary part provenance; these are not XML byte/character source maps.

```ts
import { projectDocumentText, sourceRangesForText } from '@acdh-oeaw/tei-edition-ir';
const view = projectDocumentText(edition, documentId, { deletionText: 'omit' });
const matches = sourceRangesForText(view, { start: 10, end: 20 });
```

Deletion filtering defaults to part-local text. Nested content remains visible unless the caller explicitly enables the cross-part policy documented below; unresolved boundary issues remain explicit rather than inferring deletion from offsets. Deletion filtering does not establish revision chronology, a final authorial reading, or replacement of gaps/unclear readings. Spacing requires its own explicit policy as described below. Those require additional source evidence and explicit editorial policies. Inspect `issues` before treating the output as a publication reading text.

Tests cover both policies, source immutability, nested substitutions, overlapping/adjacent deletions, anchor collapse, embedded parts, boundary issues, forward/reverse range mapping, UTF-16 offsets, empty photographs and all five serialized fixture outputs. Existing IR snapshots remain unchanged.

## Source-backed spacing and optional character expansion

The compiler now emits U+FFFC for each explicit spacing occurrence, just as missing-text occurrences already have markers. Its `spacing` annotation identifies the meaning and range of the marker; raw quantity/unit/extent/minimum evidence remains in annotation details and provenance. For a valid nonnegative integer source quantity in character units, the compiler additionally emits semantic `details.characterCount` (a decimal string under the existing details contract). Runtime consumers do not need to interpret source unit tokens. Invalid character quantities receive `invalid-spacing-quantity`; unmeasured extents, minima and physical units remain evidence without an invented exact count.

`projectDocumentText` accepts optional `spacing: 'source' | 'characters'`, defaulting to `source`. Source mode retains markers. Character mode expands only exact character counts to ordinary spaces. Unmeasured spacing remains a marker and receives an `unmeasured-spacing` projection issue. The poem fixture 0040 has 96 such occurrences; its minimums and undefined extents are not exact measurements. Source gaps are never interpreted as spacing.

Expanded runs include `spacingAnnotationId`. Any selected subsection of generated spaces maps back to the entire source spacing occurrence; a source selection covering the marker maps to the whole expansion. Copy runs retain linear mappings. Exact zero-count spacing produces no projected characters. Spacing inside excluded deletion ranges is not expanded; spacing in retained insertions is handled normally. Anchor positions and part subtree spans reflect the selected spacing policy.

`maxSpacingCharacters` optionally bounds expansion per occurrence (default 4096, a nonnegative safe integer). Larger counts stay markers with `spacing-expansion-limit`. Duplicate annotations at one marker receive `ambiguous-spacing`. A spacing annotation without its own one-character marker receives `spacing-without-marker`; zero-width legacy annotations are not assigned a fabricated position among surrounding parts/anchors. These issues belong to the derived projection, independently of compiler diagnostics.

The IR schema stays v0.2: this uses existing text, range and details fields. **Recompile older generated JSON** to obtain source-backed spacing markers and corrected offsets. The compiler's text policy and snapshots have changed; IDs and TEI source bytes have not. Historical zero-width spacing remains schema-valid but cannot be reliably expanded by a consumer. This does not claim a complete layout, physical measurement or revision model.

Tests cover opt-in expansion, source immutability, forward/reverse transformed mappings, anchor offsets, spacing inside substitutions, unmeasured/physical units, invalid/zero quantities, explicit expansion limits, legacy/duplicate annotations, gap distinction and measured versus unmeasured spacing in the real corpus fixtures.

## Declared text languages

The compiler preserves inherited part defaults and explicit language spans using existing `language` annotations. A part default covers that part's own text, with `details.scope = 'part'`, `details.depth = '0'` and the nearest source declaration in provenance. Nested parts receive their own inherited default. Explicit declarations on blocks, spans, foreign phrases, verse groups and other traversed content use `scope = 'span'` and a depth counting nested declarations within the part. Language annotation bodies are unset; text stays in part content rather than being duplicated into language metadata. Source-language declarations are read by namespace, not lexical attribute parsing in consumers.

`details.language` retains the declared string. An empty value is an explicit reset to unknown, stopping inheritance. No declaration yields unknown rather than a guessed language. A document's descriptive language inventory does not imply a default for every part. Foreign-language markup without a declared tag remains source evidence and does not invent an override. Block-ending newlines emitted by the compiler remain inside the block's declared language range.

`partLanguageRuns(edition, partId)` returns complete, half-open coverage of a nonempty part's text. Each run has `start`, `end`, optional `language`, `annotationIds` and `conflicted`. Nested declarations take precedence; narrower ranges break ties at the same depth. Equally specific contradictory declarations produce an unknown run with `conflicted: true` and all responsible annotation IDs. Tag equality ignores case, but source spellings remain available; the helper does not perform registry canonicalization, automatic language detection or text translation. Empty parts return no runs. Unknown part IDs throw a clear error.

```ts
import { partLanguageRuns, projectSourceRange } from '@acdh-oeaw/tei-edition-ir';
const languages = partLanguageRuns(edition, partId);
const visibleRanges = languages.flatMap(run =>
  projectSourceRange(projection, { partId, start: run.start, end: run.end })
);
```

Language ranges therefore compose with deletion/spacing projection mappings while remaining source-backed. Runtime consumers use semantic annotation details and ranges; no XML namespaces or TEI element interpretation are needed. The v0.2 schema is unchanged, but recompile earlier output to recover inherited defaults and declarations previously omitted on transparent blocks. Snapshot changes add these annotations and remove redundant language bodies; source text, offsets, order, entities, resources and existing scholarly assertions remain unchanged.

Tests cover inherited defaults, transparent blocks, nested/equal-range overrides, explicit unknown resets, nested parts, descriptive inventories without defaults, tied conflicts, case equivalence, projected deletions/spacing, empty photographs and all five corpus fixtures. In particular, both German address blocks in 0001 now retain their declarations, while photograph 0078 receives no invented language.

## Corpus and source-document references

Document targets now resolve after all supplied sources have registered their semantic IDs. Supplied document URIs and explicit source-location aliases identify document targets; root XML IDs, named parts and interpretation IDs can identify compiled fragment targets. Matching uses complete normalized URIs, not basenames or globally shared fragments, and does not depend on source input order. Equivalent pointer tokens and aliases do not duplicate destinations.

Prose link annotations keep their source range, label evidence and original pointer tokens. They now have outgoing relations with `predicate = 'references'`, `subjectId` equal to the link annotation ID, and destinations in `objectIds` or `externalTargets`. References within scholarly interpretation descriptions use the interpretation annotation itself as subject, with the original reference element as relation provenance. Owning documents list the relations in `relationIds`. Consumers traverse these semantic edges rather than interpreting compact URI prefixes in annotation details.

Correspondence context relations retain their existing predicate and document subject. The preset's `withinCollection` convention treats `#document-id.xml` as a document identifier; this special source convention is not applied to ordinary fragment references in prose. An ordinary `#id` remains scoped to the current document. Targets in supplied sources resolve to semantic IDs. External or absent documents, web pages and PDFs remain explicit `{ kind: 'document', sourceId: absoluteUri }` targets. They are not fetched or materialized, and absence from a selected compilation is not itself an error.

An unresolved fragment within a supplied document receives `unresolved-document-fragment` and remains an external source URI with its fragment. Inline anchors, resource fragments and other source elements without an explicitly registered document/part/interpretation target are not guessed to be runtime objects. Empty and malformed targets receive `empty-document-reference` and `invalid-document-reference`; invalid strings remain opaque external evidence with source provenance. Target collections represent destinations, not an ordered interleaving of internal/external pointers; prose annotations retain original token order as evidence.

The five fixtures produce 23 `references` relations. Two resolve internally: the 0028 commentary about the 1976 text points to memoir document 0062, and a prose reference in 0062 points to photograph 0078. This supports heterogeneous document relationships without treating every document as a textual AST. Other referenced documents remain outside the selected fixture set. The nine existing interpretation-source diagnostics are unchanged.

The schema remains v0.2. Recompile older output to obtain semantic link relations and portable normalized external document targets; the compiler does not rely on runtime reinterpretation of old source strings. Snapshot changes add relations/evidence and normalize correspondence target URIs, with no changes to source bytes, text, offsets, parts, resources or scholarly attributions.

Tests cover source-order independence, relative/full/alias URIs, mixed and repeated destinations, compiled part/interpretation/root fragments, the correspondence hash convention, unsupported or malformed references, commentary ownership, external web/PDF targets and both real internal document links.

## Annotation containment across embedded parts

The compiler now preserves a lexical annotation-to-part connection as an existing relation shape: `predicate = 'contains-part'`, `subjectId` identifying the nearest containing semantic annotation, and `objectIds` identifying an embedded child part. Relation provenance points to that part's source element. Annotation parent chains retain outer scopes, and ordinary part parentage retains the embedded subtree. This bridges coordinate systems without pretending child text occupies the parent's range.

Validation requires a local annotation subject with a source-part range, at least one part target, and direct child parts whose insertion offsets lie within that annotation's range, including its endpoints. Inclusive insertion bounds permit a zero-length parent-text range containing an entirely embedded object. Wrong categories, root/cross-scope targets and out-of-range insertion positions are rejected.

`projectDocumentText` accepts optional `nestedDeletedParts: 'retain' | 'omit'` (default `retain`). Opting into `omit` also requires `deletionText: 'omit'`. Explicit containment under a deletion annotation, directly or through its annotation ancestors, then excludes that part's text and all descendant-part text. Part boundaries and anchors still occur in the projection at collapsed positions, with original IDs and source offsets. Excluded ranges have no projected text mappings. Source IR remains unchanged.

Default part-local mode retains embedded text and reports deletion boundary issues as before. When positive containment evidence establishes an embedded part's separate scope, a coincident text offset alone does not make it deleted. When evidence is absent, including legacy generated IR, the opt-in policy still retains the part and reports ambiguity; it does not reconstruct missing source order or containment from selectors. Recompile source to obtain these relations.

```ts
const view = projectDocumentText(edition, documentId, {
  deletionText: 'omit',
  nestedDeletedParts: 'omit',
  spacing: 'source',
});
```

The pinned corpus contributes two quotation-to-embedded-part relations, in 0028 and 0062. Neither embedded part is deleted, so existing corpus projection text and anchor offsets are unchanged. Synthetic regression cases prove nested deletion behavior, wholly embedded zero-width deletions, ancestor annotation chains, nested subtrees, separate scopes at equal offsets and conservative legacy handling. Additional tests reject invalid containment and verify retained anchors, reverse-map omission and source immutability. Existing corpus diagnostics remain unchanged.

No persisted fields or version literals change: this extends the existing open relation vocabulary within v0.2. This captures source containment, not revision chronology or a final authorial reading policy.

## Revision-aware provenance manifests

`compileWithManifest(sources, mapping, options)` returns `{ edition, manifest }`; `edition` is exactly the ordinary compiler output. The optional sidecar has its own format version `1`, records `irVersion`, `editionSha256`, `mappingSha256`, and one source entry per document/authority input with name, role, optional explicitly supplied URI and SHA-256. It adds no persisted IR fields and changes no v0.2 snapshots. Input order is retained; mapping/object key order does not affect JSON fingerprints. There are no timestamps or implicit network lookups.

Source hashes cover the exact UTF-8 representation of each supplied XML string, without whitespace or Unicode normalization. The CLI hashes its decoded input text. For the five vendored UTF-8 fixtures, these hashes match the pinned upstream-byte manifest. This definition does not claim to preserve arbitrary original non-UTF-8 byte encodings after decoding.

Edition and mapping fingerprints use deterministic JSON with sorted object keys, omitted undefined object values and preserved array order. `verifyCompilationManifest(edition, manifest)` validates the complete strict sidecar, verifies source inventory/roles against every emitted provenance record, and binds the sidecar to the semantic edition artifact; JSON indentation and object-key order do not alter that binding. The mapping fingerprint records the supplied declarative configuration. This is an input/artifact integrity record, not a compiler implementation revision pin, a digital signature or proof of authenticity. Keep the relevant compiler checkout/release when reproducing a build.

`createSourceIndex(source, { expectedSha256 })` verifies a recorded source hash before parsing or resolving any selector. Its returned `sha256` is also available for inspection. A changed source with unchanged XML IDs is rejected instead of silently supplying different evidence. Without an expected hash, the existing source-index behavior remains available; the caller chooses whether revision verification is required.

```ts
import { compileWithManifest, verifyCompilationManifest, createSourceIndex } from '@acdh-oeaw/tei-edition-compiler';
const { edition, manifest } = compileWithManifest(sources, mapping);
verifyCompilationManifest(edition, manifest);
const expected = manifest.sources.find(s => s.name === provenance.source);
if (!expected) throw new Error('Provenance source is missing from manifest');
const index = createSourceIndex(source, { expectedSha256: expected.sha256 });
const element = index.resolve(provenance);
```

The CLI accepts optional `--manifest <manifest.json>` while continuing to write only edition JSON to stdout. The sidecar is written only after successful compilation. Its output path must not alias a document, authority or mapping-profile input; direct paths, symbolic links and hard links are checked to preserve canonical sources. Use separate paths for edition stdout and the manifest.

```sh
bun run compile source.xml --manifest /tmp/edition.manifest.json > /tmp/edition.json
```

Tests verify deterministic hashes, equivalent mapping-key orders, changed source/authority inputs, changed edition artifacts, malformed/unsupported manifests, all pinned fixture hashes, CLI artifact separation and source overwrite protection. Compiler and IR runtime package boundaries remain unchanged: hashing and source inspection are compile-time tooling, while normal consumers use the validated IR alone.

## Validated declarative project profiles

The CLI now accepts `--mapping <profile.json>`. Profiles have an independent format version `1` and contain `{ version: '1', mapping }`. `MappingProfileSchema` validates profile JSON; `MappingSchema` also validates direct library mapping arguments before source compilation. Unknown fields, unsupported entity kinds, empty mapped values, invalid authority-scope keys and unusable/fragment-bearing document bases are rejected. This is declarative configuration data, not executable code.

Supported mapping fields remain deliberately small:

- `partKinds`: source division category to semantic part kind.
- `elementPartKinds`: optional TEI local-element name to semantic part kind.
- `entityKinds`: source entity category to a core entity kind.
- `documentBaseUri` and `referencePrefixes`: explicit source identity and compact URI expansion settings.
- `authorityDocuments`: optional per-core-kind shared authority scopes.

Header extraction, editorial annotations, dates and other supported TEI semantics remain procedural compiler code. Profiles do not define XPath evaluation, arbitrary selectors, plugins or a general transformation language. They make the working semantic slice reusable while further mapping evidence is gathered. Declared own entries alone participate in category/prefix lookup; inherited JavaScript object properties do not become mapping rules.

The default Auden preset moved to `packages/compiler/profiles/auden-musulin.json`. Existing library `audenMusulinMapping` and no-option CLI behavior remain available and produce identical output. The exported Mapping type derives from the runtime schema. No project profile data enters the core IR package.

The project-authored `fixtures/synthetic/generic-mapping.json` and `generic-edition.xml` exercise a different structure: direct body text, nested verse, source entity types `human`/`location`, relative image URLs and an independent authority/URI namespace. They compile to generic text/verse parts and person/place entities, with supplied authority labels, dates, source-backed language/spacing, links and projections. They are synthetic mapping evidence, not another historical edition or an upstream corpus fixture.

```ts
import { MappingProfileSchema, compile } from '@acdh-oeaw/tei-edition-compiler';
const profile = MappingProfileSchema.parse(profileJson);
const edition = compile(sources, profile.mapping, { authorities });
```

Manifest mapping fingerprints cover the validated mapping data; JSON profile formatting and file location do not enter that digest. Manifest output is also prohibited from replacing a supplied mapping input. Unsupported profile versions fail explicitly. The IR schema remains v0.2 and existing corpus snapshots are unchanged.

Tests cover default-profile equivalence across all five fixtures, invalid profiles and direct API inputs, explicit-own-entry lookup, the independent synthetic structure, full CLI/profile/authority/manifest integration, early failure without artifacts and profile overwrite protection.

## Opt-in diagnostic build checks

The CLI accepts `--fail-on-diagnostics`. A compilation with any diagnostic then writes its complete validated edition JSON to stdout and any requested matching manifest, emits a deterministic per-code count summary to stderr, and exits with status 1. A clean compilation exits with status 0. Without the flag, existing behavior is unchanged: diagnostics stay in the IR and successful compilation exits normally.

This is an operational build policy, independent of project mapping semantics. The edition, manifest fingerprints, diagnostics and provenance remain unchanged; the library still returns valid IR for callers to inspect and apply their own policy. There is no implicit severity classification, suppression or fetching of absent targets.

Fatal input, mapping, XML or IR-validation errors still fail before emitting edition JSON or writing a new manifest. A diagnostic-check failure instead leaves reviewable artifacts, since compilation produced a valid edition with incomplete/unsupported evidence explicitly reported.

```sh
bun run compile fixtures/auden-musulin/amp-transcript__0001.xml --fail-on-diagnostics > /tmp/edition.json
```

The full five-fixture slice intentionally returns status 1 under this flag because nine interpretation pointers target unsupplied source documents. Default compilation remains successful. The clean synthetic profile/authority example passes the diagnostic check.

CLI tests cover default compatibility, complete validated IR and manifest output despite diagnostic failure, sorted summaries, clean success, all nine known corpus diagnostics and fatal-error artifact behavior. The IR remains v0.2 and existing snapshots are unchanged.

## Inspecting compiled artifacts

`bun run inspect <edition.json>` validates the serialized edition against the current IR schema and writes a JSON review report to stdout. It imports only the IR package and its runtime validation/helpers. It does not load TEI, resolve selectors, fetch resources or invoke the compiler. Invalid or unsupported artifacts fail before a report is emitted. A valid artifact containing diagnostics can still be inspected successfully; the compiler's opt-in build-failure policy remains separate.

`summarizeEdition(edition)` is also exported for already validated IR. It returns totals for documents, parts, text length, entities, mentions, relations, annotations, resources and anchors; entity label coverage and kind counts; relation-predicate and annotation-kind counts; external target occurrences; and diagnostic totals by code. Category tables are sorted deterministically. Source IDs are opaque keys, including values coinciding with JavaScript property names.

Per-document reports include title, source name, descriptive language inventory, part kinds, directly text-bearing part counts, text length, mentions/anchors, referenced resource IDs and owned relation/annotation IDs. Text length uses UTF-16 units, counting direct part content once without duplicating nested text. Empty text does not imply missing document semantics: photographs retain resource and anchor counts. Parent containers may have no direct text while children do.

Per-document diagnostics are grouped by the document's declared provenance source. Diagnostics belonging solely to supplied authority sources remain in the global report. Internal/external target numbers count recorded occurrences rather than unique destinations. These are descriptive artifact metrics, not editorial quality scores or inferred coverage guarantees.

```sh
bun run inspect /tmp/edition.json > /tmp/edition-review.json
```

Tests cover the heterogeneous five-document slice, image-only documents, actual contributor label coverage, known diagnostics, storage-order independence, source immutability, synthetic authority enrichment, authority-only diagnostics, empty editions, opaque identifiers and serialized artifacts whose sources are unavailable. Existing IR output and snapshots remain unchanged.


## Focused provenance and URI consistency review

`CompilationManifestSchema` is now exported for untrusted sidecar JSON. It validates required fields, SHA-256 syntax, supported versions, source names/roles, absolute fragment-free source URIs, unique names and explicit authority URIs. Hexadecimal digests are normalized to lowercase without mutating the input. `verifyCompilationManifest(validatedEdition, rawSidecar)` returns this validated metadata after checking the edition fingerprint, requiring every actual provenance source in the inventory, and ensuring document provenance uses a document-role source. Diagnostics from authority inputs also require their source entry, even when those inputs materialize no entities. Unused but explicitly supplied authority inputs may remain in the inventory.

A regression reproduced the old verifier accepting a matching edition hash after removal of all source entries. It now fails with a missing-source error. Invalid sidecar URI values are reported by `safeParse` as validation failures, rather than causing URL-parser exceptions. This validates metadata and artifact consistency; actual source content still needs the expected-hash check, and authenticity still requires independently trusted inputs.

Source names are logical filenames/paths. Their virtual file aliases now encode literal `#`, `?` and `%` characters rather than interpreting them as URI syntax. Project-base fallback identities encode path segments as data as well. Use `Source.uri` for an actual absolute identity; explicitly empty values are rejected. Document, authority and configured base/scope URIs reject fragment delimiters including an empty trailing `#`. Authority document scopes cannot contain fragments that would be silently overwritten by an entity identifier; encoded filename characters remain valid. Ordinary document links with an empty fragment normalize to the document itself, while an empty entity identifier is diagnosed.

These corrections preserve the v0.2 IR shape and the format-1 manifest shape. Existing valid generated sidecars remain supported. Corpus IR, source checksums and output snapshots are unchanged. New tests cover malformed and missing inventory data, roles, uppercase digest normalization, authority-only diagnostic provenance, literal filename characters, empty URI/fragment handling and authority-scope fragments.

## Expanded real-source coverage

The [interpretation-dependency audit](coverage-audit.md) records a separate ten-document context that compiles with zero diagnostics at the pinned upstream commit. The original five-document baseline and its nine missing-context diagnostics remain unchanged. Source-driven mappings now include address-line, work-title, postscript, glyph and glyph-description annotations, with declared glyph evidence kept separate from literal readings. These use existing v0.2 shapes; no schema version change or implicit source fetching is introduced.

## Complete-cohort consumer verification

The ten-document interpretation context is now checked across source revision/provenance resolution, independent structural order, exact direct-text reconstruction, declared language provenance and all six valid named text-projection policy combinations. Forward/reverse mappings, transformed spacing runs, anchor preservation and source immutability are asserted after JSON serialization. See the runtime-contract section of the coverage audit.

Compiler diagnostics and projection issues remain separate layers. This cohort has zero compiler diagnostics; character expansion still reports 96 distinct unmeasured spacing annotations in 0040. No language inference, spacing guess or revision chronology is added by these checks.

## Saved-artifact source verification

The compiler exports `verifyCompilationSources(validatedEdition, rawManifest, sources)` for explicit offline source inspection. It first binds the edition to the manifest, requires exactly one supplied `{ name, xml }` input per manifest source (including unused authorities), verifies each source hash before parsing, and resolves every emitted provenance selector. It returns only `verifiedSources` and `verifiedProvenanceRecords`; DOMs never enter IR or the result. Source order is irrelevant and filenames match literally. Identity/role metadata remains in the validated manifest; this helper uses names to locate exact source bytes rather than interpreting local filenames as URIs.

Changed artifacts, missing/extra/duplicate source inputs, changed revisions and unresolved selectors throw. Hashes establish consistency with the supplied sidecar, not authenticity or correctness of scholarly interpretation. The ten-document saved JSON regression verifies all 10 sources and 8,379 provenance records through this API. No persisted schema or IR version change is required.

The `bun run verify <edition.json> <manifest.json> --source <manifest-name> <local-path> [...]` command validates saved JSON before invoking the same helper. Every source is explicitly bound to a local path, allowing relocation without trusting manifest names as filesystem paths. Success emits only JSON counts with exit 0; any argument, input, validation or provenance failure emits stderr with exit 1 and no stdout result. No sources are fetched or recompiled, and input files are never modified.


## First reference consumer

The authorized local viewer now exercises the original three-document cohort using validated JSON only. Ordered part events and semantic ranges support text, overlapping evidence and nontextual documents without a schema change. See [consumer findings](reference-viewer.md) for image-service/rendition ambiguity, absent authority labels, source-link presentation metadata and the limited diplomatic reading policy. These are recorded as evidence rather than silently inferred data. IR remains v0.2.


## Independent apparatus boundary

The [second-edition validation](second-edition-validation.md) exposes a semantic limit in generic traversal. Unsupported apparatus/choice entries now become source-backed `uncompiled-content` markers with `details.feature` identifying `textual-apparatus` or `text-alternatives`, no combined reading body and precise compiler diagnostics. Their ranges cover one U+FFFC position. Explicit nonbreaking line boundaries instead become zero-width `line-continuation` annotations, preserving unbroken words and source evidence. Anchors can use ordinary manuscript page-number labels when the existing label source is absent.

These use existing v0.2 shapes and do not implement a critical apparatus. Previously compiled alternatives/nonbreaking lines require recompilation for corrected text/offsets. The Auden snapshots remain unchanged. The independent DHARMA fixture retains 183 diagnostics, including unsupported note/bibliography semantics, and must not be treated as a publication reading.
