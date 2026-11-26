# OpenAPI reference, conformance tests and Codecov coverage

## Summary

Added the unofficial Daikin Smart API OpenAPI reference to `docs/reference/`, tests that check the client's HTTP calls against it, a research note on where the plugin differs from it, and Codecov coverage upload in CI with a badge in the README. Also fixed test runs that sometimes skipped a whole test file without failing. The only plugin code change is one line that lets the token-renewal timer not keep the process alive.

## Why

A new capture of the Daikin Smart App's traffic (November 2026) was written up as an OpenAPI spec. The request was to find out which scenarios work, test the implementation against the spec, keep the spec as a reference, check for leaked credentials, and report coverage to Codecov (the `CODECOV_TOKEN` secret has been added to the repository).

## Design

- **Tests read the spec itself** (`test/openapi.test.mjs`), so paths, servers, required parameters, body fields and response examples come from the YAML, not copies of it. If the spec is updated, the tests follow.
- **Gaps are `todo` tests**, not failing tests and not code changes. They document what the spec expects, run in every build, and pass once the client matches. Fixing the gaps changes login and API calls, which `AGENTS.md` says needs a plan and ideally a real-device check, and the spec itself is unverified. See [the research note](../research/2026-11-26-openapi-conformance.md).
- A test pins the exact list of cloud calls the plugin makes that the spec doesn't describe, so any new undocumented call fails the build.
- A test checks the reference file has only placeholder credentials.
- **Dependency:** `yaml` (dev only, no dependencies of its own) to read the spec. Node has no YAML parser, and converting the spec to JSON would leave two copies to keep in step.
- **Coverage:** `npm run test:coverage` now also writes `coverage/lcov.info`, mapped back to `src/*.ts` with `--enable-source-maps` so Codecov shows the TypeScript source rather than `dist/`. CI uploads it once, from the Node.js 24 job, with `codecov/codecov-action@v7`. `fail_ci_if_error: false` so a Codecov outage doesn't block a release.
- Mapped coverage reports type-only `import` lines (erased by TypeScript) as uncovered, so the total shows about 98% rather than the 100% of `dist/`. Accepted rather than adding ignore comments.
- The test helper's mock now parses form-encoded request bodies too, which the spec's `/oauth2/token` uses.
- **Flaky test count (already broken before this change):** `npm test` used `--test-force-exit` because the client's token-renewal timer (up to an hour) kept the test process alive. With that flag the runner sometimes exited before the last test file reported, so about 1 run in 4 skipped a file (for example all of `services.test.mjs`) and still exited 0. The timer is now `unref()`ed in `scheduleTokenRefresh`, and `--test-force-exit` is removed. In Homebridge the process is kept alive by its own servers, so renewal behaves the same, and shutdown no longer waits for the timer. `--test-isolation=none` was considered, but Node 22 only has it as an experimental flag under another name.

## Files

- `docs/reference/daikin-smart-api.openapi.yaml`: the spec, unchanged.
- `docs/research/2026-11-26-openapi-conformance.md`: scenario-by-scenario comparison and credential check.
- `test/openapi.test.mjs`: conformance tests (19 passing, 4 `todo`).
- `test/helpers.mjs`: form-encoded body parsing in the mock.
- `src/client.ts`: `unref()` the token-renewal timer.
- `package.json`, `package-lock.json`: `yaml` dev dependency, `test:coverage` writes lcov, `--test-force-exit` removed.
- `.github/workflows/build.yml`: Codecov upload step.
- `README.md`: Codecov badge and "API reference" section.
- `docs/README.md`: index entries.

## Docs updated

`README.md`: a coverage badge, and an "API reference" section linking the spec and the research note. The configuration sections are unchanged. `config.schema.json` is unchanged.

## Verified / not verified

- ✅ `npm run lint` and `npm test` pass: 199 tests, 195 pass, 4 `todo`, 0 fail. The same count in 6 runs in a row. Before the fix, 1 of 5 runs reported 150.
- ✅ `npm run test:coverage` writes `coverage/lcov.info` with `SF:src/...` paths.
- ✅ Repository and git history searched for tokens, secrets, terminal IDs and passwords: none found.
- ❌ The Codecov upload and badge were not run here; they need the workflow to run on GitHub with `CODECOV_TOKEN`.
- ❌ Nothing was checked against a real purifier or Daikin account, so whether the spec's endpoints work as described is unverified.

## Follow-ups

- Plan and make the client match the spec: fetch `userinfo` and send `l_user_id` / `l_password` as `id` / `spw`, move the code exchange to `/dsioti/oauth2/token`, and confirm the `authorization` header form. Remove the `todo` markers as each passes.
