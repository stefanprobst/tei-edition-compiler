# Continuous integration

The workflows use the tested Bun version in `.bun-version`, frozen dependency installation and read-only repository access. Checkout uses the [official checkout action](https://github.com/actions/checkout); Bun installation uses the [official setup action’s version-file support](https://github.com/oven-sh/setup-bun#using-version-file).

## Fast checks

`.github/workflows/checks.yml` runs on pull requests, main-branch pushes and manual dispatch. It checks TypeScript, all unit tests, the three reference-reader builds, and the small diary/paired-letter/Akademieprotokolle static publications. These studies use supplied local fixtures. They do not fetch corpus authorities, XML or images. Dependency/runtime installation requires the normal package download step. Browser automation is not part of this workflow yet; the checked-in browser scripts remain explicit local checks.

## Full pinned publication

`.github/workflows/auden-publication.yml` runs separately on relevant main-branch pushes or manual dispatch. `amp:fetch` explicitly downloads the 78 locked source inputs and verifies size, SHA256 and upstream Git blob identity before compilation. `amp:reproduce` then performs two local compiler/source audits and clean static builds, checks the full publication baseline and compares 713 file digests. Compilation itself never fetches missing sources. There is no source cache in CI, so each run checks a fresh download.

This job does not run `amp:check-resources`: remote IIIF availability is a dated operational check, independent of compilation correctness. Fresh CI runs have no cached image report and therefore report no live-image verification. The known compiler diagnostic and missing authority labels remain explicit baseline evidence. No workflow uploads or deploys publication files.

## Local commands

```sh
bun install --frozen-lockfile
bun run typecheck
bun test
bun run viewer:build
bun run site:prepare
bun run site:build
bun run site:prepare-pair
bun run site:build-pair
bun run site:prepare-akademie
bun run site:build-akademie
# Full corpus, explicit fetch before offline build verification:
bun run amp:fetch
bun run amp:reproduce
```

The workflow YAML and corresponding commands are verified locally. The first hosted runs also passed on 2026-10-29 at commit `582d244`: [fast checks](https://github.com/stefanprobst/tei-edition-compiler/actions/runs/40837962440) and [pinned publication](https://github.com/stefanprobst/tei-edition-compiler/actions/runs/40837962409). The latter fetched the locked sources in a fresh runner and verified two clean builds. This records successful hosted execution; it does not imply branch-protection rules, browser automation in CI or site deployment.
