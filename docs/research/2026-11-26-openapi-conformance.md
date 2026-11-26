# How the plugin's API calls follow the Daikin Smart API reference

The reference is the unofficial OpenAPI spec in [`../reference/daikin-smart-api.openapi.yaml`](../reference/daikin-smart-api.openapi.yaml), reverse-engineered from Daikin Smart App traffic captured in November 2026. This note records how `src/client.ts` compared with it, and what changed so it follows it ([plan](../plans/align-api-with-openapi.md)). The unit tests in `test/client.*.test.mjs` cover each call as described here.

The spec is unofficial and partly inferred, so following it doesn't prove control works against the real server. Nothing here was checked against a real purifier or account.

## Each call, before and after

| Scenario | Spec | Before | Now |
|---|---|---|---|
| Read status | `GET api…/cleaner/get_unit_info` with `id`, `spw`, `port` and the token; text `ret=OK,group=k%3Dv…` | Same path and format, but only from the purifier's local IP | ✅ From the cloud as in the spec when a login is configured, with the local IP as the fallback |
| Start the login session | Not in the spec (it starts at `POST /auth` with the session's `state`) | `GET /dsioti/oauth2/authorize` with PKCE | Unchanged |
| Sign in | `POST /dsioti/oauth2/auth`, JSON `username`, `password`, `state`, `uuid`; code in the `location` header | Matched | Unchanged ✅ |
| Exchange the code | `POST prod-dsioti…/dsioti/oauth2/token`, form-encoded `grant_type`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier` | ❌ JSON to `api…/premise/dsiot/login`, plus `uuid` | ✅ Follows the spec |
| Renew the token | Not captured; a `refresh_token` grant on `/oauth2/token` is "likely" | JSON to `api…/premise/dsiot/token` | Form-encoded `refresh_token` grant on `/oauth2/token`. ⚠️ Unverified. If it's refused, the plugin logs in again with the email and password. |
| Device credentials | `GET /dsioti/oauth2/userinfo?access_token=…` returns `l_user_id`, `l_password` | ❌ Never called | ✅ Called once, saved in the token file |
| Change a setting | `GET /cleaner/set_control_info` with `id`, `spw`, `port`, `terminalid`, `pow`, `mode`, `airvol`, `humd` | ❌ `id=ID`, `spw=SPW` placeholders | ✅ `id` / `spw` are `l_user_id` / `l_password` |
| Token on device calls | `rawTokenAuth`: `authorization` header with the bare token (the `Bearer` prefix may have been masked in the capture) | `Authorization: Bearer <token>` | Bare token. ⚠️ Unverified. |
| Register the terminal | `local_api_key`, `set_device_token`, `terminals/{uuid}/device_token` | Not called | Not called; the spec doesn't say control depends on them |
| `basic_info`, `get_linkage_info`, `get_datetime`, `get_model_info` | Text `key=value` lists | Not called | Not needed |

## Credentials check

The reference file contains no real credentials: `mac`, `id`, `pw`, `ssid` and `name` are `<placeholders>`, and there are no tokens, secrets or email addresses in it. The repository and its history were also searched for tokens, client secrets, terminal IDs and passwords: none were found. The only fixed identifier in the code is the Daikin Smart App's public OAuth client ID (`DEFAULT_CLIENT_ID`), which is not a secret. The new device credentials (`l_password` especially) are treated as secrets: stored only in the 0600 token file, never logged, and tests check the log.

## Still open

- Bare token or `Bearer` on `set_control_info`.
- Whether the refresh grant works on `/oauth2/token`.
- Whether the terminal registration calls are needed, and where `terminalId` now comes from (see Known limitations in the README).
