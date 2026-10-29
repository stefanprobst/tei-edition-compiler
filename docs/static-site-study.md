# Static publication from IR: diary study

The first DSE Static comparison slice uses the three original Schnitzler diary entries for 9–11 June 1909. Source attribution, licensing statements, commit and checksums are recorded in [the fixture README](../fixtures/schnitzler-diary/README.md) and its manifest. This is a functional publication study, not visual parity with the original edition or a general site framework.

## Run

From the repository root:

```sh
bun install
bun run site:prepare
bun run site:build
PORT=3011 bun packages/site/scripts/serve.ts
```

Open <http://127.0.0.1:3011/diary/>. `site:prepare` is compiler-side: it checks fixture SHA-256 and original Git blob IDs, compiles, and verifies source selectors. It writes disposable JSON under `packages/site/dist/input/`. `site:build` reads only those JSON inputs and generates the 32 static files under `packages/site/dist/public/`.

The example server serves a fixed inventory of generated HTML/CSS/JS files. Any ordinary static server can host the output directory at `/diary/`. No compiler, XML parser, JSON fetch or source selector interpretation is needed to read it. The local inspector viewer remains a separate application.

For an independent edition, invoke the generator directly:

```sh
bun packages/site/scripts/build.ts edition.json manifest.json site.json output-directory
```

`site.json` is publication configuration, not Edition IR:

```json
{
  "title": "Edition publication study",
  "attribution": "Supply the edition attribution and applicable rights.",
  "basePath": "/edition/",
  "sourceLinks": {}
}
```

`basePath` must be `/` or slash-delimited path segments containing letters, digits, underscores or hyphens. `sourceLinks` maps literal manifest source names to explicit HTTP(S) canonical-source URLs. Links are not fetched or verified against remote content. No image URL adapter is inferred. The generator validates the Edition schema and manifest artifact binding before producing output; source-byte/selector verification remains a separate compiler step.

Use a fresh disposable output directory when changing cohorts: the build writes its generated files but does not delete stale files from a previous publication. A deployed directory should contain only the intended build.

## Evidence and findings

The cohort compiles into three documents, 24 entities, 31 mentions, five image resources and six source-sequence relations. All 126 emitted provenance records verify against the three original XML sources. The original 37 `unmapped-content` diagnostics are resolved: 15 given-name, 19 family-name and three role-name spans now compile into source-backed `name-component` annotations with a semantic `component` detail. Text and enclosing mention ranges remain preserved; this cohort now compiles with zero diagnostics.

The real sources prompted five generic compiler corrections/extensions without changing the IR schema:

- Explicit `documentDatePaths` in a project profile select TEI child-element paths relative to the root. The diary profile selects `text/body/div/p/date`, avoiding publication and bibliography dates. These are restricted child paths, not runtime XPath or a general expression language. Existing header date extraction remains; duplicate selected source elements are removed.
- Direct `facsimile/graphic` elements become document image resources, alongside existing surface graphics. Resource pointers can resolve their IDs or URLs. Document resource order alone does not establish page alignment: the diary's unqualified page marker remains unaligned.
- Core part text respects inherited `xml:space="preserve"` and explicit `default` resets. Mention offsets follow the resulting text. Recompile canonical sources to obtain corrected whitespace; do not patch saved IR offsets.
- Root previous/next pointers become `previous-document` and `next-document` relations. Supplied targets resolve after indexing; cohort-boundary links remain explicit external identities. No dependency is fetched automatically.

- Given, family and role names are semantic name components with text ranges and provenance. They do not create identities or infer a person's full name.

## Publication assessment

| Feature | Result and limit |
| --- | --- |
| Document overview | Static links and typed dates; progressive client-side title/date filtering. Order follows the supplied document array, with an explicit unknown-date state for other inputs. |
| Document routes | Real HTML pages with initial text, rights and source evidence. Stable URLs and record fragments derive from semantic IR IDs, independent of array position. |
| Text and notes | Ordered `documentEvents`; escaped text, mention links, basic deletion/insertion/emphasis/uncertainty styling and an annotation evidence list. Notes render separately from running text. This is not complete typography or support for experimental reading choices. |
| Entity register | 24 entity pages and passage backlinks, including repeated occurrences across documents. Names from the text are displayed with “as written” and an explanation. When several forms refer to one identity, all distinct forms are shown. The default three-file preparation uses these presentation fallbacks. Optional explicit person-register enrichment supplies 21 register labels without changing mentions; the three place entities retain text-form fallbacks. |
| Sequence | Source-declared sequence is shown separately from previous/next navigation in overview order. External sequence links do not pretend the target has a generated page. |
| Facsimiles | Five original resource links with provenance. No images vendored, no inferred IIIF rendition, no image decoding or service-availability claim. Side-by-side image reading remains a presentation gap. |
| Diagnostics | Document-scoped diagnostics plus an all-diagnostics page retain unsupported evidence. The diary cohort now has zero compiler diagnostics; this does not establish full edition support. |
| Search | Overview/entity filtering only. Full-text indexing, query results and editorial projection policy are deferred. |
| Publishing | Plain static output works at root and a non-root base path, with JavaScript optional for reading/navigation. No deployment was performed. |

Geographic maps, calendar UI, place/work authority enrichment, citation formatting, project essays/imprint, production accessibility review, full-corpus performance, full-text search and visual comparison remain outside this first slice. The paired letter now has a separate [linked-commentary study](paired-commentary-study.md); it is not included in the diary-only cohort. The original DSE Static site's full capabilities are not claimed as implemented.

## Verification

`bun run typecheck` and `bun test` cover original bytes, date mapping, space preservation and offsets, resource pointer resolution, source sequence, artifact binding, escaping, stable routes, notes/nontextual parts and every generated internal link/fragment at root and subpath deployments.

The browser check expects two static builds: the normal `/diary/` build on port 3011 and an otherwise identical build with `basePath: "/"` on port 3012. Create the root config by copying the generated `site.json` and changing only `basePath`, then run:

```sh
bun packages/site/scripts/build.ts packages/site/dist/input/edition.json \
  packages/site/dist/input/manifest.json /tmp/tei-site-root.json packages/site/dist/root
PORT=3012 bun packages/site/scripts/serve.ts packages/site/dist/root /
```

In another terminal:

```sh
playwright-cli -s=tei-site open http://127.0.0.1:3011/diary/
playwright-cli -s=tei-site run-code --filename=packages/site/scripts/browser-check.js
```

Both deployments pass filtering, direct document/entity navigation, passage backlinks, Back/Forward/reload and mobile width checks. Separate JavaScript-disabled browser contexts verify overview links, document text and entity backlinks. No XML/JSON requests or browser runtime exceptions occur. Desktop/mobile screenshots were inspected. Source image links were not fetched during these checks.

## Names shown in the interface

An authority-register label is the preferred name supplied by a person/place/work register. A mention is the wording at one position in a document: “Richard,” “Brahm,” or “Onkel Felix.” The earlier message “Canonical label unavailable” meant that the register label was absent, not that the entity link or its text was missing.

`entityDisplayName` derives display text from the IR. It prefers an explicitly supplied register label; otherwise it displays distinct recorded mention forms, marked “as written.” If neither is available it says “Unnamed person” (or the relevant kind). Both the site and inspector viewer use this fallback without modifying entities or inventing full names. Loading original authority registers is an explicit enrichment step, described below.

## Optional person-register enrichment

```sh
bun run site:fetch-authorities
bun run site:prepare --person-register packages/site/dist/sources/listperson.xml
bun run site:build
```

The fetch command downloads the complete original `indices/listperson.xml` at the same pinned upstream commit into an ignored source cache. Both fetch and preparation verify byte length, SHA-256 and original Git blob ID recorded in the fixture manifest. Cached bytes are also verified; compilation never downloads data automatically. The 24 MB register is not vendored or edited into an apparent original excerpt. A normal `bun run site:prepare` continues to produce the unenriched sample even if the cache exists.

The inspected register credits Peter Michael Braunwarth and PMB – Personen der Moderne Basis for content, and Martin Anton Müller for XML encoding. Its header contains no additional license element; the original repository CC BY-SA 4.0 statement is retained. Header publication metadata combines Briefwechsel and Tagebuch conventions; the project mapping explicitly defines the diary authority scope rather than inferring aliases from those titles.

`authorityLabelTypes.person: [""]` selects the untyped direct person name, excluding typed legacy forms, birth names and pseudonyms from preferred-label selection. This is a declarative compile-time project rule. It does not choose the first name or silently reconcile several matching names: missing and ambiguous selections still produce diagnostics. Without this option the existing conservative all-name selection remains unchanged.

All 8,479 person entries in the pinned register have one untyped name. All 21 people referenced by this cohort resolve, for example “Richard” to **Richard Beer-Hofmann**, “Brahm” to **Otto Brahm**, and “Onkel Felix” to **Felix Markbreiter**. Register names may themselves be incomplete; the compiler displays what is supplied. Only referenced entities are emitted. The three place identities remain unenriched until a place register is explicitly supplied.

The real register also exposed nested bibliographies being mistaken for standalone work-authority entries. Register indexing now excludes records nested inside another authority description while retaining independent register groups. The regression test covers an unnamed nested bibliography, an identified nested citation and a separate top-level work entry.

The enriched preparation checks that document content, mentions and entity identities are unchanged; asserts the 21 register names and an expected preferred name; and verifies all 126 emitted provenance records against all four original inputs. Entity provenance now points into `listperson.xml`, while mention provenance still points into the individual diary entries. Both sources and their hashes are recorded in the compilation manifest. The static site supplies a pinned source link to the original register and identifies register names explicitly.

This optional real-source check is separate from the offline unit suite: the suite uses project-authored register samples for selection/ambiguity/nesting regressions and does not require the cached 24 MB file or network access. The site browser script accepts either explicitly prepared mode and verifies register provenance when the register mode is active.

## Complete pinned Auden publication

The [73-document pilot](auden-publication-pilot.md) extends publication settings with explicit document route filenames, resource preview URLs, optional local search and an escaped About page. Settings remain separate from core IR. Search is derived from an explicit retain-deletions/source-spacing policy, carries reverse part ranges and is fingerprint/digest bound. Source-backed commentary, responsibility, participant context and image/page backlinks render from IR alone.

## Progressive image workspace

Explicit preview settings enable a document-local image/text workspace. The browser reads rendered resource options and page-resource links, stores explicit selection in the URL and restores native history. Desktop panes and a mobile stack share the same transcription DOM. Static resource-card fallbacks remain available without JavaScript. No synchronization or alignment is inferred from resource order. See [the full pilot](auden-publication-pilot.md#imagetext-workspace).
