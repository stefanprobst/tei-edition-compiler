# Validation against DSE Static editions

Initial reconnaissance: 2026-10-27. This records the initial source assessment and validation plan. The first diary cohort and static publication slice are now implemented; see the [results and runnable workflow](static-site-study.md). Broader compatibility and feature parity are not established.

## Two independent questions

1. Can the compiler preserve the selected editions' semantics and expose unsupported evidence honestly?
2. Can a consumer of compiled IR generate a useful static scholarly website comparable in function to DSE Static?

A successful reader import alone does not answer the second question. Compare observable reader tasks and generated artifacts, rather than reproducing XSLT templates or visual branding.

## Baseline inspected

[DSE Static Cookiecutter](https://github.com/acdh-oeaw/dse-static-cookiecutter), pinned source tree `f051705425126168f542e4dc22777ababcb3e48f`. Inspected the README, generated project's `build.xml`, `xslt/editions.xsl`, `xslt/toc.xsl` and `xslt/listperson.xsl`.

The build establishes separate document, overview, register and supporting-page outputs. The document template consumes previous/next links and includes source access and notes. The overview reads the edition collection; person output includes individual entity pages. The README additionally describes maps and external Typesense search. Template capabilities do not establish every project's current behavior; inspect each site's customizations separately.

## Proposed cohorts

| Cohort | Purpose | Status |
| --- | --- | --- |
| Auden–Musulin Papers | Existing correspondence, compound objects, images and nontextual document baseline; already listed by DSE Static | Existing pinned fixtures and compiler tests |
| Schnitzler Tagebuch | Date browsing, sequence, person/work mentions, registers, repeated occurrences | Three adjacent pinned entries vendored and tested; authority enrichment deferred |
| Schnitzler Briefe | Correspondence roles, commentary attachments, cross-edition references, image identifiers | One pinned source inspected; boundary cases identified |
| Akademieprotokolle | Different editorial genre: meeting structure and transcript/facsimile presentation | Candidate only; source repository and representative TEI not yet verified |

The first two new cohorts share a subject and authority conventions. They test different editorial structures but do not establish broad independence. Follow them with a non-Schnitzler edition. The Akademieprotokolle homepage currently reports partial functionality during technical revision, so source evidence must be assessed separately from live-site failures.

### Inspected sources and concrete evidence

- [Schnitzler Tagebuch data](https://github.com/arthur-schnitzler/schnitzler-tagebuch-data), commit `c035856ff36b3466399dc88ace33bee9b4f5b39d`, `editions/entry__1909-06-10.xml`: explicit previous/next identities, main and ISO-date titles, a dated body entry, `xml:space="preserve"`, person/work mentions, local authority fragments, two direct facsimile graphics. Repository LICENSE is CC BY-SA 4.0; this file's publication statement declares CC BY 4.0. Record both statements explicitly before vendoring; do not replace either with an inferred uniform license. Attribution includes Arthur Schnitzler, Peter Michael Braunwarth, the named editors/contributors and Austrian Academy of Sciences as recorded in source metadata.
- [Schnitzler Briefe data](https://github.com/arthur-schnitzler/schnitzler-briefe-data), commit `7b047487db1b10b887992f2b5249b93ac4e0e102`, `data/editions/L02549.xml`: Olga Schnitzler to Richard and Paula Beer-Hofmann; correspondence metadata, address and writing-session divisions, local person references, embedded register records, commentary anchors and `note/@corresp`, French text, page pointers and three opaque image identifiers. A commentary reference names the diary date `1909-06-10` without spelling out a document URI. Repository LICENSE is MIT, while XML declares CC BY 4.0 and further rights text: preserve the full statement when selecting fixtures. Do not treat repository software licensing as blanket image permission.

These bytes were inspected in temporary files only. Before vendoring, write a fixture README and manifest recording commit, original path, SHA-256, source attribution and exact license statements, then preserve upstream bytes unchanged. Fetch only explicit authority dependencies; do not vendor entire registers automatically.

## Mapping questions to resolve with tests

- Date metadata: use explicit semantic evidence, distinguishing entry date from publication dates. Never derive chronology from filenames when the TEI supplies dates.
- Sequence: preserve declared previous/next relationships separately from a website's chosen sort order. Missing cohort members remain explicit external/unresolved targets.
- Authority identity: local fragments require an explicit shared scope. Never merge people by occurrence text or fragment coincidence across projects.
- Commentary: the Briefe attachment is a boundary test for the current supported note rules. Do not move an attached note to a guessed insertion point or discard its anchor relationship.
- Cross-edition references: resolve the diary-date shorthand through a declared compile-time project rule; do not introduce Schnitzler vocabulary into core IR or guess a runtime URL.
- Images: direct graphics, page pointers and opaque service identifiers require evidence-based resource mappings. Do not synthesize image service URLs from filenames without an explicit project adapter.
- Layout: retain textual order and spacing; document any typography that cannot yet be represented. Do not equate zero diagnostics with complete presentation fidelity.

## First website acceptance slice

Use a small pinned diary cohort with at least adjacent entries, repeated entity mentions and a supplied authority record. Select exact files after inspecting their source evidence. Then add the paired letter as a deliberate boundary test, rather than hiding unsupported commentary to get a clean demo.

Generate into a disposable output directory from validated edition JSON and bound sidecars only. Site generation and browser code must not import the compiler, load TEI or interpret selectors. Canonical TEI downloads may be explicit external links.

| Reader task | Acceptance evidence |
| --- | --- |
| Browse documents | Static overview with title/date, deterministic ordering and an explicit unknown-date state; client filters are enhancement |
| Open a document directly | Real HTML route, meaningful initial content without JavaScript, stable record anchors, refresh and Back/Forward work under a deployment subpath |
| Read and inspect | Ordered text, notes and supported editorial evidence match IR; diagnostics and unsupported content remain visible |
| Follow people | Entity index/detail pages with occurrence backlinks; labels come from supplied authority data and unknown labels remain explicit |
| Consult facsimiles | Correct resource association, attribution, explicit loading failure; no historical images vendored |
| Return to evidence | Source identity and opaque selector available, canonical-source link explicit, version/rights/citation presented |
| Search | Small local search index derived from an explicit text projection policy; results link to document/part anchors and do not silently choose readings |
| Publish | Serve the generated directory with an ordinary static server; no compiler or XML required at runtime; local asset and internal-link checks pass |

Implement overview, document routes and entity backlinks first. Add small local search after this works. Maps, calendar visualization, full-corpus performance, Typesense integration, deployment automation and visual parity are later checks, not prerequisites for this slice. Geographic coordinates and project home/about/imprint content need explicit publication data; do not stretch core IR to hold website chrome or infer coordinates from place labels.

Keep project publication settings (branding, navigation, base path, editorial prose) separate from edition semantics. Reuse runtime reading/projection helpers where appropriate; a second independent consumer is useful evidence and should not require the local inspector app to become a full site framework.

## Completion criteria

Record a per-feature assessment: preserved, explicitly unsupported, mapping gap, IR gap or presentation gap. Verify source hashes/selectors, semantic expectations and generated internal links; run browser reader tasks at root and a non-root base path. Record any deliberate rendering differences from the original website. Claim parity only for the tested tasks and pinned cohort, then repeat on a non-Schnitzler edition before generalizing.
