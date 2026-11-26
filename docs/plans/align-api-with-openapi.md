# Plan: make the cloud API calls follow the OpenAPI reference

Status: approved and implemented ([change note](../changes/2026-11-26-openapi-conformance-and-coverage.md))

## Goal

Control from HomeKit uses the Daikin cloud the way the current Daikin Smart App does, as written in [`../reference/daikin-smart-api.openapi.yaml`](../reference/daikin-smart-api.openapi.yaml) (captured November 2026). Before this change the plugin used endpoints from an older capture and sent placeholder device credentials, so control could not work.

## Options considered

| Option | Why / why not |
|---|---|
| Change each call to match the spec (picked) | The spec is the newest capture of the app. The calls that differed are exactly the ones on the control path. |
| Keep the old endpoints and fall back to the spec's on error | Doubles the cloud calls when the old ones fail, against "keep API calls low", and keeps code for endpoints the app no longer uses. |
| Implement the registration calls too (`local_api_key`, `set_device_token`, `terminals/{uuid}/device_token`) | Not done: the spec doesn't say control depends on them, and `set_device_token` registers a phone's push token, which the plugin doesn't have. Revisit if control still fails with the calls below fixed. |

## Design

| Call | Before | After (per the spec) |
|---|---|---|
| Code exchange | `POST https://api.daikinsmartdb.jp/premise/dsiot/login`, JSON, with `uuid` | `POST https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/token`, form-encoded: `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier` |
| Token renewal | `POST https://api.daikinsmartdb.jp/premise/dsiot/token`, JSON | The same `/dsioti/oauth2/token`, form-encoded, `grant_type=refresh_token`, `refresh_token`, `client_id`, `client_secret`. The spec says this grant is "likely supported but not captured". |
| Device credentials | Not fetched; `id=ID`, `spw=SPW` sent | `GET /dsioti/oauth2/userinfo?access_token=…`; `l_user_id` and `l_password` are sent as `id` and `spw` |
| Token on `set_control_info` | `Authorization: Bearer <token>` | `authorization: <token>` (the spec's `rawTokenAuth`) |

- **Calls kept low:** `userinfo` is called once and its result saved in the token file. It is fetched again only after a login with a new code (possibly another account), or when a change gets a 401/403, when it is cleared along with the access token before the single retry.
- **Secrets:** `l_user_id` / `l_password` are device credentials. They go in the token file (mode 0600) and are never logged; the `userinfo` URL is logged without its `access_token`.
- **Unchanged:** `GET /dsioti/oauth2/authorize` still starts the PKCE login session (the spec starts one step later, at `POST /auth`, with that session's `state`). Status is still read from the purifier's local `GET /cleaner/get_unit_info`, the same path and format as the spec's.
- **Captured `code` setting:** still sent to the new token endpoint, without a `code_verifier`. The spec's exchange requires the verifier the app used, so a captured code alone may no longer work. Documented in the README.
- **Configuration:** no new settings. What `set_control_info` needs decides what's required:
  - `id` / `spw` come from `userinfo`, the token from `username` + `password` + `clientSecret`, and `terminalid` from `terminalId`. Those four settings are **required for control**.
  - `port` becomes **optional**: when it's empty, it's read once from the purifier's local `GET /common/basic_info` (`port=`, as in the spec's example), so it adds no cloud call. That response also holds the purifier's own `id` / `pw`, so it's never logged.
  - A captured `code` also needs `clientSecret`, because the spec's token endpoint requires `client_secret`.
  - When some control settings are filled in but not all, startup logs the missing ones by name (never their values).
  - `config.schema.json` groups the control settings in one section and says which are required.

### Addition: status from the cloud, local IP as fallback

Requested after the first version: when the Daikin login works, read status from the cloud instead of needing the local IP.

- **Cloud status:** the spec's `GET https://api.daikinsmartdb.jp/cleaner/get_unit_info` takes `id`, `spw`, `port` and the bare token, the same as control minus `terminalid`. So `username` + `password` + `clientSecret` (or a captured code or refresh token) is enough for cloud status. `terminalId` is only needed for control.
- **Fallback:** each refresh tries the cloud first. If that fails (network, server error, non-`ret=OK`, rate-limit pause, rejected login) and `host` is set, the same refresh reads the local IP, and the next refresh tries the cloud again. The fallback is logged once per outage. `host` is no longer required; with neither `host` nor a login, startup logs an error.
- **Port without a host:** `port` setting, else the local `basic_info`, else the spec's `30050`.
- **Polling interval:** the existing `cacheDuration` setting stays the one polling interval, for cloud and local reads alike. The minimum is 15 s for the local IP and **60 s for the cloud**, raised with a warning, because every cloud refresh is one request on the user's account. Rejected: a separate `refreshInterval` setting, briefly added and then removed because `cacheDuration` already does this; no cloud minimum, because with HomeKit polling that would make getting rate-limited easy.
- **Login backoff:** status refreshes now call the login path too. After a login fails for a reason worth retrying (network, server error), the plugin waits 5 minutes before the next attempt instead of retrying on every refresh. A rejected password still stops until restart.

## Files expected to change

- `src/client.ts`, `src/types.d.ts`
- `test/helpers.mjs`, `test/client.auth.test.mjs`, `test/client.control.test.mjs`
- `src/index.ts` (poll interval from the client)
- `test/client.status.test.mjs` (new), `test/plugin.test.mjs`
- `README.md` (What works, cache duration and rate limits, how status is read, required settings table, "How control works, end to end"), `config.schema.json` (layout, descriptions)

## Verification

`npm run lint && npm test`. Tests for each call's URL, method, encoding, fields and headers, the `userinfo` caching and retry, and that the device password is never logged. Not checkable here: a real purifier and Daikin account.

## Open questions

- Whether the server wants the bare token or `Bearer` on device calls (the spec says the capture may have stripped the prefix).
- Whether the refresh grant works on `/dsioti/oauth2/token`. If not, the plugin logs in again with the email and password, as it already does when renewal fails.
