# Auden–Musulin fixtures

Source: https://github.com/Auden-Musulin-Papers/amp-data
Pinned commit: `289a52de61aef0b6354e3c8298173bf1f889feb2`.
Upstream paths: `data/editions/amp-transcript__0001.xml`, `amp-transcript__0040.xml`, `amp-transcript__0078.xml`, plus stress fixtures `amp-transcript__0028.xml` and `amp-transcript__0062.xml` in the same upstream directory.

Attribution: Auden-Musulin-Papers project, Austrian Academy of Sciences; individual editorial responsibilities and rights statements remain in each unmodified TEI header. Repository license: Creative Commons Attribution 4.0 International (see vendored LICENSE). Image and literary-work rights may differ: this fixture set vendors XML only, not linked images, and does not relicense underlying works.

0001: envelope and letter, correspondence, entities/events, interventions and IIIF.
0040: envelope, letter and attached typed poem, heterogeneous surfaces.
0078: photograph, participants/roles, setting/date and facsimile metadata.
0028 and 0062: revision-heavy prose stress tests with nested substitutions, embedded texts, quotations and cross-document interpretations. These are evidence for extending the first slice, not a claim of complete revision support.

Files are unmodified upstream bytes. `manifest.json` records SHA-256 checksums. Compiler output is disposable and does not replace these sources.

Additional coverage fixture: data/editions/amp-transcript__0009.xml, at the same pinned commit and under the attribution/licensing above. It was selected after the interpretation-dependency audit revealed a real addrLine address-line mapping gap. It is not part of the original five-document baseline. The unmodified bytes were checked against the upstream Git tree's blob identity before vendoring, and its SHA-256 is included in manifest.json.

Additional coverage fixture: data/editions/amp-transcript__0043.xml, at the same pinned commit and under the attribution/licensing above. Its interpretation is referenced by 0031 in the temporary dependency audit. The source adds real work-title, postscript and declared-glyph cases; its bytes were verified against the pinned upstream Git blob before vendoring. It is an extension regression fixture, not a replacement for the original five-document baseline.

Interpretation-context fixtures: data/editions/amp-transcript__0012.xml, data/editions/amp-transcript__0031.xml and data/editions/amp-transcript__0053.xml, under the same pinned commit, attribution and license. Their original bytes were matched to the upstream Git blobs before vendoring. Together with 0009 and 0043 they close the interpretation dependencies introduced by the baseline. No external authority indexes or images are included.

manifest.json defines the initial three-document slice, the original five-document baseline, and the ten-document interpretation-closure cohort. Keep those scopes distinct: the baseline intentionally retains nine missing-context diagnostics; the closure cohort is expected to compile with none.
