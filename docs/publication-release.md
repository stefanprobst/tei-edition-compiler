# Publication release preparation

`amp:release` packages an existing validated Auden edition/manifest for an explicit deployment path. It consumes JSON only: no XML compilation, source inspection, downloads, repository writes or hosting operations occur inside this command. Run `amp:fetch` and `amp:audit` first when preparing from canonical sources. The release uses the unchanged corpus baseline and retains known source issues.

```sh
bun run amp:fetch
bun run amp:audit
bun run amp:release /tei-edition-compiler/ packages/site/dist/amp-release
# Preview exactly the intended hosting path:
PORT=3022 bun packages/site/scripts/serve.ts packages/site/dist/amp-release/public /tei-edition-compiler/
```

Choose `/` for root hosting, or a slash-delimited subpath. The destination must be absent or empty; existing release output is never silently replaced. Use a fresh directory for another release. Invalid paths or edition/manifest bindings fail before output is written. Publication verification then checks the emitted pages, anchors and search mappings against the full pinned-corpus baseline. Failure leaves output available for inspection and returns a nonzero exit status; it does not publish it.

The directory contains:

- `public/`: 709 static files; this directory alone is the hosting payload.
- `site.json`: exact publication settings, including the deployment path.
- `release.json`: version 1 inventory with the edition fingerprint, base path and SHA256 for every public file. It records derived artifact identity, not remote deployment or source-byte verification.

The repository-subpath release was verified locally at `/tei-edition-compiler/`, including browser history, explicit image selection, search/reload, part links, source markers and no-JavaScript reading. External images retain original rights and are loaded only through explicit reader interactions. The dated HEAD availability report is not a guarantee of future service availability.

The full pinned-publication CI workflow also packages this repository-subpath release after the two clean-build check. The manual `Edition preview` workflow deploys the verified public payload to GitHub Pages. After authorized public repository visibility, the initial deployment succeeded on 2026-10-29. See [the reader review](reader-review.md) for the preview URL and review tasks. The same payload can also be served by an ACDH static host or another static server at the declared path. Search requires HTTPS or localhost for WebCrypto, correct JavaScript/JSON MIME types and unmodified build files.
