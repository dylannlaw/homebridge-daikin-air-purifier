# Release to npm on every commit to master

## Summary

Every push to `master` that changes what ships now builds, tests and publishes a new version to npm, and creates a matching tag and GitHub Release. Nobody bumps the version by hand any more.

## Why

Releasing needed a manual version bump (standard-version) in a separate change, so merged fixes could sit unpublished. The request was to work like MacAwake, where every commit to `main` builds and publishes a release.

## Design

Modelled on MacAwake's `release.yml` and `tests.yml`:

- **`tests.yml`** lints, builds and tests on Node 22, 24 and 26 for every pull request and every push to `master`, skipping docs-only changes. It is also a reusable workflow (`workflow_call`).
- **`release.yml`** runs on pushes to `master` that touch shipping files (`src/**`, `config.schema.json`, `package.json`, `package-lock.json`, `tsconfig.json`, `.npmignore`, the workflow itself), or by hand. It calls `tests.yml` first, then publishes.
- **Version:** `MAJOR.MINOR` from `package.json` plus the workflow's run number as the patch, like MacAwake's `VERSION` + run number. npm needs three-part semver, so MacAwake's `1.2.<run>` becomes `0.2.<run>`. CI writes it into the package with `npm version --no-git-tag-version` and does not commit it back, so `master` never gets bot commits and branch protection doesn't need a bypass. The run number increases on every run, so versions skip numbers but always go up.
- **Safety checks:** a re-run of the same run finds its version already on npm and does nothing. A version lower than npm's `latest` (e.g. after the workflow file is renamed and its run number restarts) fails the job instead of moving users backwards. One release runs at a time (`concurrency: release`).
- **Release notes:** `gh release create --generate-notes` writes notes from the merged PRs. `CHANGELOG.md` stays as history up to 0.2.0; standard-version is no longer used.
- **Security:** same rules as MacAwake. Never runs on pull requests, actions pinned to commit SHAs, `persist-credentials: false`, the npm token only in the publish step, and the tag is created through the GitHub API so no git credentials are needed. Publishing keeps npm trusted publishing with provenance, falling back to the `NPM_TOKEN` secret.

Considered and not picked:

- **Patch = highest published patch + 1**, read from npm. Gives consecutive numbers, but a re-run would publish the same commit twice under a new number, and it races if two runs overlap.
- **semantic-release / conventional commits deciding major/minor/patch.** More moving parts and a new dependency; the request was for every commit to release, which the run number already does.
- **Releasing on docs-only commits too.** Would publish identical code under a new version. Docs and README changes go out with the next code release, as in MacAwake.

## Files

- `.github/workflows/build.yml`: removed, split into the two below.
- `.github/workflows/tests.yml`: tests on PRs and pushes; reusable.
- `.github/workflows/release.yml`: version, publish to npm, tag and GitHub Release on every shipping commit to `master`.
- `AGENTS.md`: the version and changelog rules now match the automatic release.
- `README.md`: the Changelog section points to GitHub Releases, and a row of badges under the title (like MacAwake's) shows the npm version, downloads (last 18 months and per month), test status, stars, supported Homebridge and Node.js versions, and the license. Shields.io redirects its "total downloads" badge to the 18-month count because npm only keeps that much history, so the badge says so.

## Docs updated

`AGENTS.md`, `README.md` and this note. `config.schema.json` is unchanged: no settings changed.

## Verified / not verified

- ✅ Both workflow files parse as YAML.
- ✅ The version step's shell logic, run locally against the real npm registry: `0.2.3` and `0.2.41` are accepted over the current `latest` (0.2.0), and a lower version (`0.1.5` vs `0.2.0`) is refused.
- ✅ `npm version 0.2.41 --no-git-tag-version` updates `package.json` and `package-lock.json` as expected.
- ✅ `npm run lint && npm test` passes.
- ✅ Every shields.io badge URL returns a badge with real values (v0.2.0, 1.1k downloads in 18 months, 71/month, the Node.js range, the license).
- ❌ The test-status badge shows "no status" until `tests.yml` has run on `master`. The README on npm and in the Homebridge UI only updates with the next release, because a README-only change doesn't release.
- ❌ The workflows have not run on GitHub yet. The first push to `master` that touches shipping files after this merges is the real test. Merging this PR itself triggers a release, because it changes `release.yml`.
- ❌ Not checked whether trusted publishing is set up on npmjs.com for this repository. If it is, the trusted publisher's workflow file name must be changed from `build.yml` to `release.yml`, or publishing fails; otherwise the `NPM_TOKEN` secret is used.
- ❌ If branch protection requires the old `Test (Node.js …)` checks from `build.yml`, they now come from `tests.yml` under the same job names; check the required checks still match.

## Follow-ups

- If skipped patch numbers become annoying, switch the patch to "highest published + 1" and guard against duplicate publishes of one commit.
