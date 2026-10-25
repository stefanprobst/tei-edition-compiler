# Second real-edition validation: Amaramālā

This validation uses one complete original file from [DHARMA’s Sanskrit philology corpus](https://github.com/erc-dharma/tfd-sanskrit-philology/tree/de63a675e759cd09905069655c9f90cd4a513d33), pinned at `de63a675e759cd09905069655c9f90cd4a513d33`. Attribution, file-level CC BY 4.0 licensing, checksums and byte-preservation evidence are recorded in the [fixture README](../fixtures/dharma/README.md) and manifest. The draft status in the source is retained. This is a real edition, not the repository’s separately named sample/template file.

## Selection evidence

*Amaramālā: Digital Critical Edition of British Library, Burnell 436e*, by Arlo Griffiths and Zakariya Pamuji Aminullah, supplies a contrasting encoding with:

- 23 apparatus entries: 22 lemma/reading pairs and one note-only parallels entry;
- one declared manuscript witness, with siglum and description;
- Sanskrit transliteration and other script content;
- 17 manuscript page markers and 304 line-break elements, including 126 nonbreaking continuations;
- 130 scholarly note elements, headword labels and bibliographic references;
- edition, grouped sections, translation, commentary and bibliography divisions. Some declared sections are empty.

This tests inline apparatus and manuscript text flow. It does **not** establish support for a multi-witness critical apparatus, stand-off annotations or arbitrary DHARMA data. Faust was considered during discovery, but its repository distinguishes manuscript transcriptions from a generated edited text/apparatus; this compact source gives directly inspectable, licensed evidence without expanding acquisition scope.

## Failure reproduced before changes

The existing generic traversal emitted both lemma and variant as consecutive text. For example, source `caraṇa` versus `-carṇa-` became `caraṇa-carṇa-`, and a longer pair became `darpābhimānāhaṁkārōdarpōbhimānahaṁkārō`. A diagnostic about an unmapped element did not stop consumers from mistaking that string for a reading.

The unconditional line-break policy also split the source’s explicit nonbreaking boundary: `śabda-bheda` + a break marked `no` + `m` became two lines rather than `śabda-bhedam`.

These are compiler semantics problems, not viewer layout problems. They falsify a claim that the existing Auden path generalizes unchanged to critical editions.

## Narrow corrections

Unsupported apparatus and explicit choice groups now occupy one U+FFFC source-backed marker with an `uncompiled-content` annotation. Its feature distinguishes textual apparatus from text alternatives. The marker has no body pretending to contain a chosen or combined reading. The diagnostic is `unsupported-textual-apparatus` or `unsupported-text-alternatives`, with exact source provenance. Descendant branches are quarantined together rather than traversed into running text. No lemma preference, witness identity, reading chronology or semantic apparatus model is invented.

Explicit nonbreaking line boundaries emit no newline; a zero-width `line-continuation` annotation preserves their provenance and containment. Ordinary line breaks retain existing behavior. Page-marker labels use the existing label field, with the source’s ordinary page-number label when the established label attribute is absent.

The existing open annotation vocabulary, ranges, details and anchors accommodate these corrections. Persisted field shapes and IR version remain v0.2. Recompile affected sources: derived text and offsets for previously flattened alternatives or falsely broken words change intentionally. The Auden fixture snapshots remain unchanged.

## Result and its limits

The independent profile maps six parts: edition, two grouped sections, translation, commentary and bibliography. The partial output has 449 annotations, 17 labelled anchors, no image resources, 126 line-continuation annotations and 23 apparatus markers. All 656 emitted provenance records resolve against the verified source revision.

**Strict compilation fails intentionally:** 183 diagnostics, comprising 23 unsupported apparatus entries and 160 unmapped occurrences. The latter include 127 notes, 19 labels, eight numbers, one list of apparatus entries, one bibliography list, one bibliography entry, one pointer and two cited ranges. Notes outside quarantined apparatus still enter the generic traversal with diagnostics; they have not become a semantically separated scholarly-note layer. The text must not be published as a critical reading. A valid IR schema and resolvable provenance do not establish complete scholarly semantics.

Reproduce the boundary:

```sh
bun run compile fixtures/dharma/DHARMA_CritEdAmaramalaBLBurnell436e.xml \
  --mapping fixtures/dharma/mapping.json \
  --fail-on-diagnostics --manifest /tmp/dharma.manifest.json > /tmp/dharma.json
# Expected exit 1; validated partial IR and matching manifest remain available for review.
```

Tests pin source/license SHA-256 and Git blob identities, verify original apparatus counts, source-marker ranges, containment, nonbreaking words, manuscript labels and all provenance. The normal diagnostic CLI tests now recognize the more specific choice diagnostic; unrelated unmapped-element behavior remains tested independently.

## Next model decision

Before claiming positive critical-edition support, define alternatives as mutually exclusive content with witness/editorial assertions and source-backed anchoring. An inline variant is not merely a deletion/insertion pair. Empty readings, apparatus notes and a witness’s manuscript identity also require explicit treatment. Scholarly notes need their own semantic placement rather than inclusion in the reading string.

The next bounded implementation should compile a small apparatus-bearing passage into a proposed typed alternative representation, validate it against this complete fixture and an independently inspected multi-witness example, and decide how runtime consumers select/read alternatives without XML knowledge. This validation deliberately stops before designing that model from only one witness and 22 pairs.

## Executable follow-up

The [text alternatives experiment](alternatives-experiment-v0.2.md) now tests a separate versioned candidate contract against this source and an independently inspected manuscript/previous-edition comparison source. It accounts for all markers without promoting the experiment into the main Edition schema or selecting a reading implicitly.
