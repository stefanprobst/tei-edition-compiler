# TEI Edition Compiler

- Workspace package names use the @acdh-oeaw scope and tei-edition- prefix (tei-edition-ir, tei-edition-compiler, tei-edition-viewer).
- TEI/XML is always canonical. Edition IR is derived, disposable and versioned.
- Compile semantic, typed web-native structures; never mechanically serialize XML into JSON.
- Runtime consumers need no XPath, namespaces or TEI vocabulary. XPath/XSLT are acceptable compile-time tools.
- Preserve provenance to source document and stable selectors wherever possible.
- Core IR must contain no Auden-specific concepts. Documents need not contain text.
- Keep entities separate from mentions; relationships explicit; scholarly interpretation, responsibility and certainty structured.
- Represent facsimiles as resources and anchors. Dates distinguish exact, interval and textual values.
- Prefer project-configurable declarative mappings where feasible; procedural plugins only where needed. Do not build a framework ahead of working evidence.
- First slice: amp-transcript__0001, __0040, __0078. Revision stress fixtures __0028 and __0062 are now vendored and tested; their containment model does not yet establish a complete revision graph.
- Keep packages/ir and packages/compiler minimal. The authorized local reference viewer lives in packages/viewer and consumes compiled JSON only; keep source inspection and compiler dependencies out of its browser bundle.
- Record upstream commit, attribution and licensing before vendoring. Preserve original fixtures byte-for-byte.
- Record model changes in the current versioned IR design notes; docs/ir-v0.1.md is the historical baseline and docs/ir-v0.2.md documents the current contract. Run typecheck and compiler tests after changes.

- Resolve interpretation links after indexing supplied sources, using full document identity plus fragment. Keep absent targets explicit with provenance and diagnostics; never fetch missing sources implicitly.
- Entity identity uses full authority URIs; shared fragment scopes must be explicit in the project mapping. Keep occurrence labels on mentions until authority data supplies canonical labels; diagnose conflicting classifications.
- Preserve date precision and explicit offsets. Validate the documented Gregorian subset; retain unsupported/conflicting dates as text with source diagnostics. Never invent a timezone or silently convert calendars.
- Provenance selectors must round-trip through the compiler source index. Reject duplicate XML IDs, keep namespace-qualified structural paths unambiguous, and keep source DOMs out of IR.
- Resolve facsimile pointers individually, preserving usable images when other pointers/bounds fail. Resource URLs may inherit XML bases; never fetch images implicitly or infer crop/zone semantics from surface bounds.
- Current IR version is 0.2. Parts and anchors require a shared document-local order; runtime reading order must use IR fields, never provenance selectors. Recompile TEI rather than guessing missing order when migrating v0.1 JSON.
- Authority enrichment is explicit and local: supplied TEI register records may provide labels/provenance, never occurrence text. Match full URIs, materialize only referenced entities, and keep synthetic register evidence clearly separate from upstream corpus fixtures.
- Scholarly attribution uses explicit responsible-for relations from person entities to annotations. Keep raw responsibility tokens as evidence, scope local IDs to source documents, resolve only supplied contributor/authority records, and preserve definition and binding provenance separately.
- Text projections must require explicit editorial filtering policies, leave source IR unchanged, preserve reverse mappings and anchors, and report cross-part deletion ambiguity instead of inferring revision chronology.
- Explicit spacing must occupy source-backed positions. Character expansion is a separate opt-in projection policy with reverse mappings; preserve unmeasured extents/minima and physical units rather than inventing exact counts. Recompile legacy zero-width spacing instead of guessing its order.
- Preserve inherited part languages and explicit span declarations as source-backed annotations. Empty declarations reset to unknown; descriptive inventories do not imply defaults. Runtime language resolution must expose conflicts and use semantic ranges, not XML or language guessing.
- Corpus links must become explicit semantic relations using full URI identity. Resolve supplied document/part/interpretation targets after indexing; retain external destinations and unsupported fragments with evidence, never basename guesses or implicit fetching.
- Preserve lexical annotation-to-embedded-part containment as explicit contains-part relations. Nested deletion projection is opt-in, requires positive containment evidence, retains boundaries/anchors, and stays conservative for legacy IR or ambiguous offsets.
- Optional compilation manifests bind source/mapping fingerprints to the edition artifact. Source inspection may require an expected hash; never silently verify a changed revision by XML IDs alone. Derived manifest output must not overwrite canonical document or authority inputs.
- Project JSON profiles use the strict versioned MappingProfileSchema; validate direct Mapping arguments too. Keep profiles declarative and limited to evidenced semantic mappings, match only declared entries, and retain a synthetic independent-project test alongside Auden compatibility checks.
- Diagnostic build failure is opt-in via --fail-on-diagnostics. Preserve validated IR and matching manifests for review, keep summaries on stderr, and leave default compiler/library behavior unchanged.
- Artifact inspection and summaries must consume validated IR alone. Keep source selectors opaque, avoid source loading/inference, distinguish direct part text from nested content, and retain global diagnostics that do not belong to document sources.
- Manifest verification must validate sidecar structure and cover every emitted provenance source with correct document roles. Treat source names as literal paths, reserve Source.uri for actual identities, and reject fragment-bearing document/base/authority scopes consistently.
- Keep the original five-document baseline separate from the ten-document interpretation-closure cohort listed in the fixture manifest. Extend mappings from verified real-source evidence; preserve upstream bytes, attribution and checksums before vendoring dependencies.
- Glyph handling preserves supplied literal readings and source-backed declaration descriptions. Empty or unsupported readings remain marked/diagnosed; never infer characters from description prose.
- Keep compiler diagnostics separate from runtime projection issues. Closed-cohort verification must preserve source revision/provenance, ordered text, declared language evidence and reversible mappings under explicit policies; zero compiler diagnostics must never erase editorial uncertainty.

- Unsupported apparatus/choice branches must not be concatenated into running text: emit source-backed uncompiled-content markers with precise diagnostics until a semantic alternatives model exists. Preserve explicit nonbreaking line continuations and manuscript page labels. The pinned DHARMA fixture is a diagnostic-bearing boundary cohort, not a claim of critical-edition support.

- Text alternatives are currently a separate experimental v0.2 extension bound to a v0.2 edition fingerprint and existing markers. Keep candidate selection explicit, preserve empty/neutral readings and local witness scope, distinguish manuscripts from previous editions, and reject unsupported nested semantics atomically. Do not promote the experiment to the main IR or remove base diagnostics without resolving candidate-local interventions and reversible selection mappings.

- Experimental candidate and note annotations use their own bounded UTF-16 ranges and parent graphs. Projection requires an explicit candidate and deletion policy; retain reverse mappings and missing-text issues. Empty readings and gap/omission markers are different evidence. Candidate-local projections remain distinct from the experimental document composition API; neither mutates base-edition markers.

- Experimental document composition snapshots and fingerprint-checks the base artifact in the runtime, keeps part and candidate source coordinates discriminated, and records marker replacement spans separately. Base exclusions must not resurrect selected content; preserve anchors, empty-choice spans and unselected/unsupported issues. Do not infer reading choices or erase compiler diagnostics.

- The study viewer offers explicit candidate controls and a separate projected preview, with source/witness/intervention inspection and history restoration. Keep source text and compiler diagnostics intact; clear stale projections and prevent pending demo loads from overwriting uploads. Demo extension metadata must not leak into standalone uploaded editions.
