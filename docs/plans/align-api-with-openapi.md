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
- **Configuration:** no new settings. The `clientSecret` description now points at the `/dsioti/oauth2/token` request.

## Files expected to change

- `src/client.ts`, `src/types.d.ts`
- `test/helpers.mjs`, `test/client.auth.test.mjs`, `test/client.control.test.mjs`
- `README.md`, `config.schema.json`

## Verification

`npm run lint && npm test`. Tests for each call's URL, method, encoding, fields and headers, the `userinfo` caching and retry, and that the device password is never logged. Not checkable here: a real purifier and Daikin account.

## Open questions

- Whether the server wants the bare token or `Bearer` on device calls (the spec says the capture may have stripped the prefix).
- Whether the refresh grant works on `/dsioti/oauth2/token`. If not, the plugin logs in again with the email and password, as it already does when renewal fails.
