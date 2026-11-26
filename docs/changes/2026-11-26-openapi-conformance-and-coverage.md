# Follow the OpenAPI reference for API calls, and Codecov coverage

## Summary

The plugin's cloud calls now follow the unofficial Daikin Smart API reference (added in `docs/reference/`):
- The code exchange and token renewal use `POST /dsioti/oauth2/token`, form-encoded.
- The device credentials come from `GET /dsioti/oauth2/userinfo`; before, the literal `ID` / `SPW` was sent.
- `set_control_info` sends the bare access token.

Unit tests cover each call. CI uploads coverage to Codecov, and the README shows a badge. Test runs no longer skip files at random.

## Why

A new capture of the Daikin Smart App's traffic (November 2026) was written up as an OpenAPI spec. Compared with it, the control path used endpoints from an older capture and never sent real device credentials, so control could not work. See the [plan](../plans/align-api-with-openapi.md) and the [comparison](../research/2026-11-26-openapi-conformance.md). Codecov was requested; the `CODECOV_TOKEN` secret is set on the repository.

## Design

- **API calls:** see the plan's table. `userinfo` is called once and saved, and fetched again only after a new code login or a 401/403 on a change. That keeps the extra cloud calls to one per login.
- **Secrets:** the device credentials are stored in the 0600 token file and never logged. The `userinfo` URL is logged without its `access_token`.
- **Captured `code` setting:** kept, but it is sent without a verifier, and the spec's PKCE exchange may need one. The README says so.
- **Tests:** the existing unit tests were updated to the spec's endpoints, bodies and headers. New tests cover `userinfo` (fetched once, saved across restarts, kept across renewals, refetched after a new login or a 401, a missing field fails the change) and check the device password never appears in the log. The mock tells the code exchange and renewal apart by `grant_type`, since they share one URL. An earlier draft added tests that parsed the YAML spec; they were dropped in favour of plain unit tests on the client, along with the `yaml` dev dependency, so no dependency is added.
- **Flaky test count (already broken before this change):** `--test-force-exit` was needed because the token-renewal timer kept the test process alive. With it, about 1 run in 4 ended before the last file reported and still exited 0. The timer is now `unref()`ed and the flag removed. In Homebridge the process stays alive anyway, so renewal behaves the same.
- **Coverage:** `npm run test:coverage` writes `coverage/lcov.info`, mapped back to `src/*.ts` with `--enable-source-maps`. CI uploads it once, from the Node.js 24 job, with `codecov/codecov-action@v7` and `fail_ci_if_error: false`. Type-only `import` lines are reported as uncovered once mapped, so the total is about 98%.

## Files

- `src/client.ts`, `src/types.d.ts`: token endpoint, userinfo, bare token, `TokenResponse` / `UserInfo` types from the spec, timer `unref()`.
- `test/helpers.mjs`, `test/client.auth.test.mjs`, `test/client.control.test.mjs`, `test/client.local.test.mjs`: spec endpoints in the mock, updated and new tests.
- `docs/reference/daikin-smart-api.openapi.yaml`: the spec, unchanged.
- `docs/plans/align-api-with-openapi.md`, `docs/research/2026-11-26-openapi-conformance.md`, `docs/README.md`.
- `README.md`, `config.schema.json`: login steps, `clientSecret` source, captured-code caveat, API reference link, Codecov badge.
- `package.json`: lcov output, `--test-force-exit` removed.
- `.github/workflows/build.yml`: Codecov upload.

## Docs updated

`README.md` (How login works, `clientSecret`, advanced `code`, API reference, badge), `config.schema.json` (`clientSecret` description), `docs/`.

## Verified / not verified

- ✅ `npm run lint` and `npm test`: 187 tests pass, the same count on repeated runs.
- ✅ `npm run test:coverage` writes lcov with `SF:src/...` paths, and `client.ts` is at 100%.
- ✅ Repository and history searched for credentials: none found.
- ❌ Not run against a real purifier or Daikin account. Whether the server wants the bare token, accepts the refresh grant on `/oauth2/token`, or needs the terminal registered first is unverified.
- ❌ The Codecov upload and badge need the workflow to run on GitHub.

## Follow-ups

- Try on a real account. If `set_control_info` returns 401/403, try the `Bearer` prefix next.
- Look at the registration endpoints if control still fails, and as a possible source of `terminalId`.
