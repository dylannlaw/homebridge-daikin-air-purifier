# Require Homebridge 2.0 and test 2.0 to 2.4 and latest

## Summary

The minimum Homebridge version is now 2.0.0 (`engines.homebridge` is `^2.0.0`, was `^1.8.0 || ^2.0.0`), released as plugin 2.0.0. CI now also builds and tests the plugin against Homebridge 2.0.0, 2.1.0, 2.2.0, 2.3.0, 2.4.0 and the latest release (`latest` on npm, 2.5.0 today).

## Why

CI tested several Node.js versions but only the Homebridge version in `package-lock.json` (2.4.0), so nothing checked the supported range. The maintainer chose to drop 1.x rather than test it. Also, Homebridge 1.8.0 declares only Node.js 18 and 20, while the plugin needs Node.js 22 or later.

## Design

- A second job, `homebridge`, in `tests.yml`: one Node.js version (24.x, which all five releases support), one entry per Homebridge release, plus `latest`. It installs that release over the locked one with `npm install --no-save`, checks the installed version, and runs `npm test`, which type-checks against it (the build) and runs the tests with its HAP library. `release.yml` calls `tests.yml`, so a release also needs this job to pass.
- Not picked: every Node.js version times every Homebridge version (15 jobs for little extra). Letting `latest` fail without failing the run: the failure would be easy to miss.
- `latest` is there to catch a breaking Homebridge release early. The cost: it can fail an unrelated pull request, and blocks releases until fixed.
- Major version bump, because users on Homebridge 1.x can no longer use new versions.

## Files

- `package.json`, `package-lock.json`: `engines.homebridge`, version 2.0.0.
- `.github/workflows/tests.yml`: the Homebridge job.

## Docs updated

`README.md` (requirements), `CHANGELOG.md`, the docs index. No settings or behaviour changed, so no guide or schema change.

## Verified / not verified

- ✅ `npm run lint && npm test` pass, and `npm test` passes (244 tests) with each of Homebridge 2.0.0 to 2.4.0 and latest (2.5.0) installed, on macOS with Node.js 26.12.0.
- ❌ The new CI job has not run on GitHub yet, so not on Linux or Node.js 24.
- ❌ The tests use a mock Homebridge API. A real Homebridge was not started, and nothing was tried on a purifier.

## Follow-ups

- `latest` only runs on pull requests, pushes to `master` and manual runs, so a new Homebridge release is noticed at the next one. A scheduled run would notice it sooner.
- Homebridge 2.0.0 to 2.2.0 don't declare Node.js 26; the README says so.
- Add the new checks to branch protection if they should be required.
