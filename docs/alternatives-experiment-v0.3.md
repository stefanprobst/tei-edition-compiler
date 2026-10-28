# Alternatives experiment v0.3: abbreviation and expansion

The experiment now covers two explicit group kinds:

| Group kind | Candidate roles | Evidence |
| --- | --- | --- |
| `textual-variation` | `editorial-base`, `variant` | Existing manuscript/edition witness evidence and apparatus notes; no default reading. |
| `abbreviation-expansion` | `abbreviated-form`, `expanded-form` | Exactly one form of each kind, no editorial preference or invented witness assertion. |

`AlternativeGroup.kind` is required. Mixed roles are rejected, and each group kind must match the base marker’s semantic feature. Abbreviation/expansion groups have exactly two candidates and no apparatus notes or witness assertions. The extractor supports exactly one source `abbr` and one `expan` branch in either source order. Other choice structures, duplicate/missing forms, nested choices, unsupported content and unsupported attributes remain atomically diagnosed. This is not a generic serialization of TEI choice children.

The extension has version `0.3` and binds to an exact IR v0.4 fingerprint. Its remaining fields and projection APIs are unchanged. Candidate content uses the shared annotated-text model with typed literal abbreviation marks and superscript. Source order is preserved, but does not establish preference. Empty readings, supplied expansions, deletion policy and source coordinates retain their existing explicit boundaries. Selection must identify a candidate; neither first sibling nor expanded form is automatically chosen.

## Real source evidence

The two pinned Akademieprotokolle sources contain 64 choices: 58 in `C_0001.xml` and six in `A_0058.xml`. Every choice has one expanded and one abbreviated branch. There are 54 nested abbreviation marks and 20 explicitly declared superscript spans, all preserved with source selectors and candidate-local ranges. For example the source forms `P.` and `pleno`, `T.` and `titolo`, and `S` plus raised `ne` and `Seine` remain independent candidates.

All 64 groups extract with zero extension diagnostics. The base edition remains unchanged apart from the required format version: its 64 markers, all original text, 73 compiler diagnostics, page/resource evidence and register identities are retained. The static publication still displays base markers and incomplete-reading notices. Experimental candidates are not silently substituted into that publication.

Tests compare every candidate's exact text to the selected original source element and every local annotation range to its original nested source element. Source indentation and declared whitespace remain literal. This experiment adds no whitespace-normalization policy or preferred reading.

Existing DHARMA extraction remains 35 represented apparatus groups and two explicitly unsupported entries, with the same witness classifications and intervention behavior. All groups now carry the explicit textual-variation kind; there is no reinterpretation of witness roles as abbreviation roles.

## Run and inspect

```sh
bun run site:prepare-akademie
bun run viewer:build
PORT=3015 bun packages/viewer/scripts/serve.ts
```

Open <http://127.0.0.1:3015/?edition=akademie> and select the second meeting for a six-choice walkthrough. The first document exposes 58 choices. Each form must be selected explicitly. The preview reports the still-present compiler diagnostics separately from projection issues; image zones and physical layout remain outside this experiment.

Preparation also writes `packages/site/dist/akademie-input/alternatives.json`, alongside its matching edition/manifest. It can be loaded through the existing explicit local artifact loader. No filename discovery or XML fetching was added. The viewer build's built-in demo compiles pinned sources only in the build script; its browser bundle still depends only on IR.

The shared renderer distinguishes literal abbreviation marks and superscript and retains scholarly evidence. Option labels compact display whitespace only; candidate content, projections and reverse mappings preserve original characters. Forms are labelled as source-encoded with no preferred reading, rather than pretending they are witness variants.

## Validation and migration

Unit tests cover all 64 real groups, typed mark/superscript spans, exact source round-trips, unchanged base IR, explicit abbreviated/expanded document composition, reversible candidate ranges, page-anchor preservation, atomic unsupported cases, role/kind consistency and stale-version rejection. The complete six-choice document can be projected explicitly in either form with no unselected markers; this is a policy-driven derived view, not a change to canonical TEI.

```sh
playwright-cli -s=tei-site open http://127.0.0.1:3015/?edition=akademie
playwright-cli -s=tei-site run-code --filename=packages/viewer/scripts/abbreviation-browser-check.js
```

Browser checks cover both documents' group counts, empty initial selections, written and expanded forms, literal marks, semantic superscript, Back/Forward/reload, base-text preservation, mobile width, zero XML requests and zero runtime exceptions. Recompile IR v0.3 and alternatives v0.2 artifacts from source; do not relabel old payloads or carry their fingerprints forward.
