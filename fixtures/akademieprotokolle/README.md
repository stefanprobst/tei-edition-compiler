# Akademieprotokolle: non-Schnitzler validation cohort

Canonical data: https://github.com/acdh-oeaw/akademie-data
Pinned commit: e070de78deee44a725c9615e83e0582d80b83ef4.
Application inspected separately: https://github.com/fun-with-editions/akademie-static at 5df770515413658d3970a8cbb5e329a1307fba09; its README and fetch script identify the canonical data repository.

Selected original sources: `data/editions/C_0001.xml` (philosophical-historical class, 24 November 1847) and `data/editions/A_0058.xml` (general meeting, 29 May 1852). They test meeting metadata, page structure, entity mentions, abbreviations/expansions, polygonal facsimile zones and distinct paragraph-layout conventions. The original `data/indices/listperson.xml` is supplied explicitly as an authority dependency, not emitted as another document.

Attribution: Sitzungsprotokolle der Österreichischen Akademie der Wissenschaften; Stefan Sienell, Austrian Academy of Sciences / Austrian Centre for Digital Humanities and contributors credited in the source metadata. Source headers identify the Transkribus/tranScriptorium document-creation workflow. Preserve all original metadata.

Licensing evidence is recorded before vendoring: `data/meta/arche_constants.rdf` declares CC BY 4.0 (`https://vocabs.acdh.oeaw.ac.at/archelicenses/cc-by-4-0`) in the shared `RepoObject` metadata, ACDH as licensor and ÖAW as rights holder. There is no repository LICENSE file and the two selected TEI headers contain no licence element. The original `data/meta/about.xml` also contains “Alle Rechte 2020 Österreichische Akademie der Wissenschaften.” Both original metadata files are retained as evidence; do not replace their distinct statements with the application code's MIT license. No facsimiles are downloaded or vendored.

All vendored originals remain byte-for-byte unchanged. Paths, SHA-256, upstream Git blob IDs and roles are recorded in manifest.json. Metadata evidence is not compiled into document content. Rendering directives and image-zone semantics require their own assessment; this cohort must not be described as full edition or facsimile-layout support.
