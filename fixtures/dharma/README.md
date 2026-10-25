# DHARMA Sanskrit philology validation fixture

Upstream repository: https://github.com/erc-dharma/tfd-sanskrit-philology

Pinned commit: `de63a675e759cd09905069655c9f90cd4a513d33` (2026-09-14).

Selected source: `editions/DHARMA_CritEdAmaramalaBLBurnell436e.xml` — *Amaramālā: Digital Critical Edition of British Library, Burnell 436e*. Digital edition by **Arlo Griffiths and Zakariya Pamuji Aminullah**, DHARMA project, supported by European Research Council grant agreement 809994. The source contains draft revision history; it is not represented here as a finished or independently verified scholarly edition.

The file’s publication statement explicitly grants **Creative Commons Attribution 4.0 International**, https://creativecommons.org/licenses/by/4.0/. The repository’s pinned `LICENCE.txt` supplies the license text copied here as `LICENSE`. XML content remains governed by that upstream license; project code has not been substituted for its attribution. No manuscript images, fonts, external bibliography or linked authority files are vendored. This README is project-authored documentation.

The commit, attribution and license were recorded before copying the original XML into this directory. The upstream XML is preserved byte-for-byte, including header, comments and whitespace. Its SHA-256 is `f1d029df85a299052029482939b3f30bb83d58813b06ba4026a8a5b76bab5007`; its Git blob identity is `a9661c8f4db2b97f6d51215fbebc09f3a5583d66`, checked against the pinned upstream tree. The manifest records these identities and upstream paths.

## Why this source

This is a compact real critical edition, rather than a schema example or a project-authored synthetic text. It contrasts with Auden through Sanskrit transliteration, a header witness record, inline lemma/reading alternatives, manuscript page/line labels, explicit unbroken line continuations, parallels, inline scholarly notes and separate edition/translation/commentary/bibliography sections.

It has 23 apparatus entries: 22 contain a lemma and a witness reading, while one is a note-only parallels entry. One witness record is declared. This is evidence for apparatus behavior, not a multi-witness or stand-off validation claim.

## Deliberately incomplete compilation

`mapping.json` maps existing division categories without adding DHARMA-specific IR concepts. This fixture is a negative/partial-support boundary test, not an additional zero-diagnostic cohort. The compiler must not concatenate mutually exclusive readings. Unsupported apparatus entries occupy one source-backed marker with an `uncompiled-content` annotation and a diagnostic. The original content remains in canonical TEI and can be inspected through provenance; the marker does not claim the readings have been semantically compiled.

Unbroken line continuations preserve text flow and zero-width source evidence. Other unsupported elements and inline-note/bibliography semantics remain diagnostic-bearing limitations. The generated text is not a publication reading and must not be presented as a complete critical edition. Use `--fail-on-diagnostics` to make this boundary explicit in builds.


## Independent multi-attestation comparison

A second complete source is pinned at the same upstream commit: `editions/DHARMA_CritEdSarvatathagatatattvasangraha.xml`, *Sarvatathāgatatattvasaṅgraha: Digital Critical Edition with Reference to the Codex Unicus and Previous Editions*, digital edition by **Ryugen Tanemura and Arlo Griffiths**, DHARMA/ERC 809994. Its publication statement independently grants CC BY 4.0. This attribution and license record precedes vendoring the unmodified source. SHA-256: `2ea4de84937dcd078fde30a49afae63b6e3e8476881a6ce53c1713b698bb6368`; Git blob: `e94dbd41fd5484a0ddbd14e8c76ee4388ac77eb1`.

This source declares one manuscript and two previous editions as attestations, with 14 apparatus entries and 19 variant-reading elements. It tests multiple witness bindings and mixed-content readings; it is not evidence for three independent manuscript witnesses. Its nested reading interventions and annotated notes deliberately exceed the first plain-text alternatives experiment. The complete source is retained to avoid silently turning an extracted passage into apparently complete upstream evidence.
