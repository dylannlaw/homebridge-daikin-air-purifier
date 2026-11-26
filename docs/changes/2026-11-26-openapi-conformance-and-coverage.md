# Follow the OpenAPI reference for API calls, and Codecov coverage

## Summary

The plugin's cloud calls now follow the unofficial Daikin Smart API reference (added in `docs/reference/`):
- The code exchange and token renewal use `POST /dsioti/oauth2/token`, form-encoded.
- The device credentials come from `GET /dsioti/oauth2/userinfo`; before, the literal `ID` / `SPW` was sent.
- `set_control_info` sends the bare access token.
- With a Daikin login configured, status is read from the cloud's `GET /cleaner/get_unit_info`, as in the spec, so the local IP isn't needed. `host` is now optional and used as the fallback when a cloud read fails. The existing `cacheDuration` still sets how often status is fetched: at least 15 s locally, and now at least 60 s from the cloud, with the rate-limit risk documented.
- The settings control needs are now the ones `set_control_info` actually depends on: `username`, `password`, `clientSecret` and `terminalId` are required. `port` is optional and read from the purifier's local `basic_info` when it's empty. Startup names any missing settings.

Unit tests cover each call. CI uploads coverage to Codecov, and the README shows a badge. Test runs no longer skip files at random.

## Why

A new capture of the Daikin Smart App's traffic (November 2026) was written up as an OpenAPI spec. Compared with it, the control path used endpoints from an older capture and never sent real device credentials, so control could not work. See the [plan](../plans/align-api-with-openapi.md) and the [comparison](../research/2026-11-26-openapi-conformance.md). Codecov was requested; the `CODECOV_TOKEN` secret is set on the repository.

## Design

- **API calls:** see the plan's table. `userinfo` is called once and saved, and fetched again only after a new code login or a 401/403 on a change. That keeps the extra cloud calls to one per login.
- **Secrets:** the device credentials are stored in the 0600 token file and never logged. The `userinfo` URL is logged without its `access_token`.
- **Captured `code` setting:** kept, but it is sent without a verifier, and the spec's PKCE exchange may need one. The README says so. It now also needs `clientSecret` to enable control, since the token endpoint requires `client_secret`.
- **Cloud status and fallback:** see the plan's "Addition" section. Every refresh tries the cloud first and falls back to `host` for that refresh only, logging once per outage. A failed login now backs off for 5 minutes, so refreshes don't hammer the login server. Considered polling only locally whenever `host` is set: rejected, because the request was for the cloud to be the source and the local IP the fallback.
- **Required settings:** worked out from what `set_control_info` needs (README "How control works, end to end"). `port` is read from `http://<host>/common/basic_info` (local, once per restart) when not set, and the response, which holds the purifier's own credentials, is never logged. A local-only start with some control settings filled in logs `Control is off because these settings are missing: …`, with names only. `config.schema.json` groups the control settings in a "Control from HomeKit" section. Considered also defaulting `terminalId` to the app UUID, since the spec calls the login `uuid` a "terminal/client UUID", but rejected it for now: it's a guess, and a wrong one would turn every change into an error.
- **Tests:** the existing unit tests were updated to the spec's endpoints, bodies and headers. New tests cover `userinfo` (fetched once, saved across restarts, kept across renewals, refetched after a new login or a 401, a missing field fails the change) and check the device password never appears in the log. The mock tells the code exchange and renewal apart by `grant_type`, since they share one URL. An earlier draft added tests that parsed the YAML spec; they were dropped in favour of plain unit tests on the client, along with the `yaml` dev dependency, so no dependency is added.
- **Flaky test count (already broken before this change):** `--test-force-exit` was needed because the token-renewal timer kept the test process alive. With it, about 1 run in 4 ended before the last file reported and still exited 0. The timer is now `unref()`ed and the flag removed. In Homebridge the process stays alive anyway, so renewal behaves the same.
- **Coverage:** `npm run test:coverage` writes `coverage/lcov.info`, mapped back to `src/*.ts` with `--enable-source-maps`. CI uploads it once, from the Node.js 24 job of `tests.yml`, with `codecov/codecov-action` v7.1.1 pinned by SHA and `fail_ci_if_error: false`. Type-only `import` lines are reported as uncovered once mapped, so the total is about 98%.

## Files

- `src/client.ts`: cloud status with local fallback, cloud minimum for `cacheDuration`, login backoff, shared cloud device call.
- `src/index.ts`: polls on the client's `cacheDuration`, which applies the cloud minimum.
- `test/client.status.test.mjs`: cloud status, fallback and `cacheDuration` tests. `test/plugin.test.mjs`: polling interval tests.
- `src/client.ts`, `src/types.d.ts`: token endpoint, userinfo, bare token, `TokenResponse` / `UserInfo` types from the spec, timer `unref()`.
- `test/helpers.mjs`, `test/client.auth.test.mjs`, `test/client.control.test.mjs`, `test/client.local.test.mjs`: spec endpoints in the mock, updated and new tests.
- `docs/reference/daikin-smart-api.openapi.yaml`: the spec, unchanged.
- `docs/plans/align-api-with-openapi.md`, `docs/research/2026-11-26-openapi-conformance.md`, `docs/README.md`.
- `README.md`, `config.schema.json`: required settings, end-to-end control flow, `clientSecret` source, captured-code caveat, API reference link, Codecov badge; schema layout and descriptions.
- `package.json`: lcov output, `--test-force-exit` removed.
- `.github/workflows/tests.yml`: Codecov upload (pinned to a commit SHA like the other actions; skipped when `release.yml` calls the workflow).

## Docs updated

`README.md` (Configuration table with required settings, "How control works, end to end", advanced `code`, API reference, badge), `config.schema.json` (layout, required-for-control descriptions), `docs/`.

## Verified / not verified

- ✅ `npm run lint` and `npm test`: 228 tests pass, the same count on repeated runs. `client.ts` coverage 100%.
- ✅ Every `config.schema.json` property is in its layout. Not looked at in the Homebridge UI.
- ✅ `npm run test:coverage` writes lcov with `SF:src/...` paths, and `client.ts` is at 100%.
- ✅ Repository and history searched for credentials: none found.
- ❌ Not run against a real purifier or Daikin account. Cloud `get_unit_info` follows the spec but hasn't been called for real. Whether the server wants the bare token, accepts the refresh grant on `/oauth2/token`, or needs the terminal registered first is unverified.
- ❌ The Codecov upload and badge need the workflow to run on GitHub.

## Follow-ups

- Try on a real account. If `set_control_info` returns 401/403, try the `Bearer` prefix next.
- Look at the registration endpoints if control still fails, and as a possible source of `terminalId`.
