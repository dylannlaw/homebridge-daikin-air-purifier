# Remove nodemon and `npm run watch`

## Summary

nodemon, `nodemon.json` and the `npm run watch` script that used them are removed. `npm run homebridge:local` stays the one way to run the plugin in a Homebridge. `npm audit` now reports no problems.

## Why

- `npm audit` reported 2 moderate advisories: nodemon depends on `minimatch`, which crafted glob patterns can make very slow ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), affects `minimatch` 7.0.0 to 11.0.0). The newest nodemon (3.1.14) still requires `minimatch ^10.2.1`, so upgrading doesn't fix it. It was dev-only and never shipped to users.
- `npm run watch` came with the 2022 template and was nodemon's only use. It used `npm link` into a global Homebridge and `~/.homebridge`, the approach [the local Homebridge script](2026-11-26-local-homebridge-script.md) chose not to use. No guide mentioned it. Without a hand-written `~/.homebridge/config.json`, it started a Homebridge without the plugin.

## Design

nodemon is removed outright instead of being worked around. Options not picked:

- **npm `overrides` forcing `minimatch` 11 for nodemon.** It changes `package.json` outside devDependencies and scripts, so `should-release.sh` would publish a release for nothing. It also forces a major version of a library nodemon wasn't built for.
- **Pinning nodemon 3.1.11** (what npm audit suggests). It goes backwards, and Dependabot would keep proposing the vulnerable version.
- **Replacing nodemon with a small Node.js watch script.** It was written and worked, but it kept a second way to test, built on `~/.homebridge`.
- **Rebuilding on save in `npm run homebridge:local -- watch`.** It was built and tested, then left out to keep the script simple. To test a change, press Ctrl+C and run `npm run homebridge:local` again, as [the testing guide](../guides/testing-locally.md#step-5-test-a-change) says.

## Files

- `package.json`, `package-lock.json`: the `watch` script and nodemon are removed (22 packages fewer).
- `nodemon.json`: removed.
- `.npmignore`: the `nodemon.json` entry is removed.

## Docs updated

The `docs/README.md` index. No user docs mention `npm run watch` or nodemon. No version bump: only devDependencies and scripts changed, so nothing is released.

## Verified / not verified

- ✅ `npm run lint && npm test` passes (244 tests).
- ✅ `npm audit` reports 0 problems.
- ✅ `should-release.sh` and `check-version.sh` against `master`: `release=false`, version unchanged.
- ✅ No file in the repository still refers to nodemon or `npm run watch`, except older change notes that describe history.

## Follow-ups

None.
