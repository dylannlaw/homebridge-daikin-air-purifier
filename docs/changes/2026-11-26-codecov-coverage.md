# Upload test coverage to Codecov

## Summary

The test run now writes an lcov coverage report for the TypeScript sources, the Tests workflow uploads it to Codecov, and the README shows a coverage badge.

## Why

Coverage was printed in the CI log only, so there was no history and nothing to see on a pull request. A `CODECOV_TOKEN` repository secret was added for this.

## Design

- **Report:** `npm run test:coverage` keeps Node's built-in coverage (no new dependency) and adds an lcov reporter writing `coverage/lcov.info` next to the usual console output. `--enable-source-maps` maps coverage from `dist/*.js` back to `src/*.ts`, so Codecov shows the files people edit. The script creates `coverage/` first because Node doesn't. `coverage/` is already in `.gitignore` and `.npmignore`.
- **Upload:** one upload, from the Node 24 job, through `codecov/codecov-action` pinned to a commit SHA like the other actions. `fail_ci_if_error: false`, because pull requests from forks can't read the token and shouldn't fail for that.
- **Not during releases:** `release.yml` calls `tests.yml`. The upload step checks `github.workflow == 'Tests'`, so it only runs when Tests runs on its own, and a release never waits on or fails because of Codecov. `release.yml` doesn't pass secrets to the called workflow anyway.
- **Badge:** a shields.io Codecov badge in the same grey style as the existing badges, after the test-status badge.

Considered and not picked:

- **c8 or nyc** for coverage: a new dependency, and Node's built-in coverage already covers this.
- **Uploading from every Node.js version:** three identical reports for the same code.

## Files

- `package.json`: `test:coverage` writes `coverage/lcov.info` and maps coverage to `src/`.
- `.github/workflows/tests.yml`: Codecov upload step.
- `README.md`: coverage badge.

## Docs updated

`README.md` (badge) and this note. No settings changed, so `config.schema.json` is unchanged.

## Verified / not verified

- ✅ `npm run test:coverage` passes locally and writes `coverage/lcov.info` with an entry for every file in `src/`, also when `coverage/` doesn't exist yet.
- ✅ `npm run lint` passes, and `tests.yml` parses as YAML.
- ✅ The pinned action commit is the `v7.1.1` release, and it has the `files`, `token` and `fail_ci_if_error` inputs used here.
- ❌ The upload hasn't run on GitHub yet. This pull request is the first run.
- ❌ The badge shows "unknown" until a report from `master` reaches Codecov.
- ❌ Not checked that the Codecov app or repository is set up on codecov.io beyond the token being added.

## Follow-ups

- If wanted later, a `codecov.yml` can set coverage targets for pull requests.
