# Schnitzler diary validation cohort

Upstream: https://github.com/arthur-schnitzler/schnitzler-tagebuch-data
Pinned commit: c035856ff36b3466399dc88ace33bee9b4f5b39d.

Selected original documents: `editions/entry__1909-06-09.xml`, `editions/entry__1909-06-10.xml`, `editions/entry__1909-06-11.xml`. Adjacent entries exercise dated text, sequence, repeated people and facsimile resources. Preserve downloaded files byte-for-byte; checksums and upstream Git blob IDs are recorded in manifest.json.

Attribution: Arthur Schnitzler, *Tagebuch 1879–1931*, Austrian Academy of Sciences; source metadata names the scholarly editors, Peter Michael Braunwarth, Werner Welzig and additional contributors and transformation responsibilities. Retain the complete upstream headers for attribution and source bibliography.

Licensing: the upstream repository LICENSE declares CC BY-SA 4.0; the sampled document publication statements declare CC BY 4.0 for text and TEI XML. Both statements are retained without resolving their difference. LICENSE is the unchanged upstream repository license. Facsimile rights are separate; no images are vendored.

No authority register is vendored with this cohort: the person register is approximately 24 MB. Shared person/place/work scopes in mapping.json are explicit project mappings, not a claim that authority records were loaded. Without an explicitly supplied register, authority labels remain unset; occurrence labels must not be promoted into register names. Entity pages can still expose identity and source-backed occurrence backlinks.

This cohort is independent of the Auden and DHARMA fixtures. It is a small publication validation sample, not complete edition support.

## Optional original authority registers

The next enrichment check uses upstream `indices/listperson.xml` at the same pinned commit. Its original Git blob ID is `a8cf8ebbaa99e29b069390dd8370b1c9a16de226` (24,081,075 bytes). Repository attribution and CC BY-SA 4.0 licensing above also apply to this register; any additional header license statement must be retained and reported. The complete original bytes are kept in ignored `packages/site/dist/sources/`, rather than adding the large register to Git or presenting an edited excerpt as the original. Downloading is an explicit preparation action, separate from compilation; ordinary compiler and site builds never fetch authority data implicitly.


The inspected register has 8,479 person records. Its header credits Peter Michael Braunwarth and PMB – Personen der Moderne Basis for content and Martin Anton Müller for XML encoding. It supplies no additional licence element. The header combines a Briefwechsel title/publication identity with a Tagebuch source description; we preserve those original statements and bind identities through the explicit diary project scope, rather than inferring aliases from the header. These are shared source conventions, not a reason to rewrite the file.

The diary mapping explicitly selects untyped person names (`authorityLabelTypes.person: [""]`). Each person in this pinned register has one such name, alongside possible pseudonyms, birth names and legacy forms. No preference is inferred from sibling order, and no mention text is changed. Only the 21 referenced people become enriched entities. The three referenced places retain “as written” names until their own register is explicitly supplied.
