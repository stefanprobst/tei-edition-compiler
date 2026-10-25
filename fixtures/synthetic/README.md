# Synthetic compiler evidence

These fixtures were authored for this project. They are not copied from upstream and do not assert historical facts about the Auden–Musulin corpus.

`authorities.xml` exercises the supplied-authority input contract for people, places, organizations, events and works, including structured person-name components. Its `https://example.test/authorities.xml` identity is a test URI, never fetched. The real pinned `amp-data` tree does not contain the authority indexes referenced by its edition files; no live or unpinned register has been substituted for those missing sources.

`generic-edition.xml` and `generic-mapping.json` provide independent, synthetic mapping evidence: body/verse element-based parts, custom entity categories, separate URI scopes, local authority labels, relative image URLs, languages and editorial text. These examples assert no historical facts and contain no Auden-specific source categories. Their profile uses the versioned JSON configuration contract exposed by the CLI.
