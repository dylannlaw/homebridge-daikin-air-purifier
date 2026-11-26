# Keep the version in package.json and CHANGELOG.md in step with npm

## Summary

The version in `package.json` is now the version that gets published. A pull request that changes the plugin raises it and adds a `CHANGELOG.md` entry, the tests check that, and merging publishes exactly that version with the entry as the GitHub Release notes. `package.json` goes from `1.0.0` to `1.0.5` to match npm, and `CHANGELOG.md` gets entries for 0.2.1, 0.2.2, 0.2.4 and 1.0.5.

## Why

The released version and the repository had drifted apart. CI made the patch from the release workflow's run number and wrote it only into the published package, so `package.json` said `1.0.0` while npm had `1.0.5`, and `CHANGELOG.md` stopped at 0.2.0. The request was to fix both.

This brings back the manual version bump that [Release to npm on every commit to master](2026-11-26-release-on-every-commit.md) dropped. The new reason: without it the repository can't say which version is released or what changed in it.

## Design

- **`.github/scripts/check-version.sh BASE`** runs as a step of the test job on pull requests, so it is covered by the required `Test (Node.js …)` checks. If `should-release.sh` says the plugin changed, the version must be higher than the base branch's. Whenever the version changes, `package-lock.json` must match it and `CHANGELOG.md` must have a `## [x.y.z]` (or `###`) heading for it. The version can never go down. The test job now checks out the full history so the base commit is there.
- **`release.yml`** publishes the version in `package.json` if it isn't on npm yet, after the tests. It no longer computes or writes a version. If the version is already on npm:
  - the push raised it (a re-run of a release) or didn't change the plugin: nothing to do;
  - the plugin changed without a bump (e.g. an admin merged past the checks): the job fails, so it isn't skipped silently.
  It still refuses a version lower than npm's `latest` and fails if `CHANGELOG.md` has no entry for the version. The release notes are that entry (extracted with `awk`), instead of `--generate-notes`.
- **Dependabot:** a runtime dependency bump changes `package.json`, so its PR fails the check until someone pushes a version bump and a changelog entry to it. devDependency bumps aren't affected.
- **Backfilled entries** are written from the GitHub Release notes for 0.2.1 to 1.0.5. 0.2.3 and 1.0.0 to 1.0.4 were never published; the changelog says so.

Considered and not picked:

- **CI commits the version and changelog back to `master` after publishing.** Fully automatic, but the "Protect Master" ruleset blocks pushes from the workflow's `GITHUB_TOKEN`; it would need a personal access token from an admin account that can bypass the ruleset, stored as a secret. Rejected for now in favour of no new secret.
- **A release PR opened by CI (release-please style).** PRs opened with `GITHUB_TOKEN` don't trigger the required checks, and it adds an action or dependency.

No new dependencies.

## Files

- `.github/scripts/check-version.sh`: new, the pull request check.
- `.github/scripts/should-release.sh`: comment only; it now means "needs a version bump".
- `.github/workflows/tests.yml`: full checkout, and the version check on pull requests.
- `.github/workflows/release.yml`: publish the version in `package.json`, notes from `CHANGELOG.md`.
- `package.json`, `package-lock.json`: version `1.0.5`.
- `CHANGELOG.md`: new intro and entries for 0.2.1 to 1.0.5.
- `AGENTS.md`, `README.md`, `.github/pull_request_template.md`: the new rule.
- `docs/changes/2026-11-26-release-on-every-commit.md`, `docs/changes/2026-11-26-version-1-0.md`: marked superseded.

## Docs updated

`AGENTS.md` (sections 5 and 7), `README.md` (Changelog section), the PR template, `docs/README.md` and this note. No guide or setting changed.

## Verified / not verified

- ✅ `check-version.sh` in a scratch clone: this change (1.0.0 to 1.0.5, no plugin change) passes; a `src/` change without a bump fails; a bump without a changelog entry fails; a bump with an entry passes; a docs-only change passes.
- ✅ The release workflow's "Is there a new version to release?" step, extracted from the YAML and run against npm: merging this change gives `release=false` (1.0.5 is on npm); a `src/` change without a bump fails; a bump to 1.0.6 with an entry gives `release=true`.
- ✅ The `awk` notes extraction prints the 1.0.5 and 0.2.4 entries without their headings.
- ✅ Both workflow files parse as YAML. `npm run lint && npm test` pass.
- ❌ The workflows haven't run on GitHub with these changes. This PR's own test run is the first real run of the check; the first publish happens with the next plugin PR.
- ❌ Not checked: a re-run after npm publish succeeded but the GitHub Release step failed skips the release; create it by hand in that case.

## Follow-ups

None.
