# Full pinned Auden–Musulin publication cohort

Canonical source: https://github.com/Auden-Musulin-Papers/amp-data
Pinned commit: 289a52de61aef0b6354e3c8298173bf1f889feb2.
Scope: every XML file under `data/editions/` at that commit: 73 documents. Files in `data/tmp/`, framework examples and editorial website metadata are not edition documents. This is the complete edition inventory at the pinned revision, not a claim to include later Auden in Austria Digital releases.

Attribution: Auden–Musulin Papers, Austrian Academy of Sciences, and the scholarly editors/contributors and individual rights statements in the original TEI headers. The pinned repository LICENSE declares CC BY 4.0, already preserved under fixtures/auden-musulin/LICENSE. Literary and image rights remain separate. No images are downloaded or vendored.

The complete original XML is downloaded explicitly into ignored `packages/site/dist/amp-sources/`, verified against the pinned inventory and retained unchanged. This source cache is separate from generated IR/site output. The existing initial, baseline and interpretation-closure fixtures remain distinct regression cohorts. No source is fetched implicitly by the compiler or browser. Authority dependencies are inventoried and pinned separately before use; missing names are not inferred from occurrence labels.

## Authority revision

Explicit authority source: https://github.com/Auden-Musulin-Papers/amp-entities at c40710c90054e8adef5188a5168c09adb7d5c824, the five `out/amp-index-*.xml` registers. This is a separately pinned authority revision, not a claim that the two repositories form one historical release. The inspected person-register header identifies 2024 publication metadata, declares CC BY 4.0 for TEI and credits Sandra Mayer, Timo Frühwirth, Dimitra Grigoriou and Daniel Elsner. Its literary-rights statement is retained. Repository LICENSE is MIT for software; it does not replace the XML's license or image/literary rights. Preserve each complete original header and all source bytes. Source identities use the mapping's full authority URIs, not register labels or basename matching.

## Build and review

Run `bun run amp:fetch`, `bun run amp:audit`, `bun run amp:build` and `bun run amp:verify`. Optional `bun run amp:check-resources` performs explicit HEAD requests only. See [the publication report](../../docs/auden-publication-pilot.md) for reader-task coverage and unresolved evidence. Document Source.uri values are explicit inventory identities: they do not rewrite contradictory root XML IDs. The compact audit baseline preserves the one unresolved responsibility, six absent authority records and one declared-ID discrepancy.
