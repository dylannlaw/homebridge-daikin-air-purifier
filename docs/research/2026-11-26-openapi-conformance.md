# How the plugin compares with the Daikin Smart API reference

Compares `src/client.ts` with the unofficial OpenAPI reference in [`../reference/daikin-smart-api.openapi.yaml`](../reference/daikin-smart-api.openapi.yaml), which was reverse-engineered from Daikin Smart App traffic captured in November 2026. The checks are automated in [`test/openapi.test.mjs`](../../test/openapi.test.mjs). Gaps are `todo` tests there: they run and report, but don't fail CI, and start passing when the client is changed to match.

The spec is unofficial and partly inferred, so "matches the spec" does not mean "works against the real server". Nothing here was checked against a real purifier or account.

## Summary

| Scenario | Spec | Plugin | Status |
|---|---|---|---|
| Read status (sensors, power, mode, fan, humidifier) | `GET /cleaner/get_unit_info` on the cloud, `ret=OK,group=k%3Dv…` | Same path and format, read from the purifier on the local network with no login | ✅ Works. Parsing of the spec's example is tested. |
| Start the login session | Not in the spec (it starts at `POST /auth`) | `GET /dsioti/oauth2/authorize` with PKCE, from an older capture | ⚠️ Not covered by the spec |
| Sign in with email and password | `POST /dsioti/oauth2/auth`, JSON `username`, `password`, `state`, `uuid`; code in the `location` header | Same | ✅ Matches |
| Exchange the code for tokens | `POST https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/token`, **form-encoded**, `grant_type`, `code`, `redirect_uri`, `client_id`, `client_secret`, `code_verifier` | `POST https://api.daikinsmartdb.jp/premise/dsiot/login`, **JSON**, the same fields plus `uuid` | ❌ Different endpoint and encoding (`todo` test). The response fields (`access_token`, `refresh_token`, `expires_in`) do match. |
| Renew the access token | Not captured; the spec says a `refresh_token` grant on `/dsioti/oauth2/token` is likely | `POST https://api.daikinsmartdb.jp/premise/dsiot/token`, JSON | ⚠️ Unverified either way |
| Get the device credentials | `GET /dsioti/oauth2/userinfo?access_token=…` returns `l_user_id` and `l_password` | Never called | ❌ Missing (`todo` test) |
| Change a setting | `GET /cleaner/set_control_info` with `id`, `spw`, `port`, `terminalid`, `pow`, `mode`, `airvol`, `humd` | Same path, parameter names and types, but `id=ID` and `spw=SPW` are literal placeholders | ❌ `id` / `spw` should be `l_user_id` / `l_password` (`todo` test). This alone would explain control failing. |
| Token on device calls | `authorization` header, bare token; the spec says a `Bearer` prefix may have been masked | `Authorization: Bearer <token>` | ⚠️ Unverified; the spec says test both |
| Register the terminal | `GET /dsiot/local_api_key`, `/common/set_device_token`, `/dsiot/terminals/{uuid}/device_token` | Not called | ⚠️ Unknown whether control needs them; possibly where `terminalId` comes from |
| `basic_info`, `get_linkage_info`, `get_datetime`, `get_model_info` | Text `key=value` lists | Not called | ✅ Not needed. The parser handles all four examples (tested). |

## So, does everything work?

- **Status (local): yes.** It uses the same path and response format as the spec, and the spec's example parses into every field the spec lists.
- **Control (cloud): very likely not**, on current app versions, which matches the "Known limitations" in the README:
  1. `set_control_info` sends `id=ID&spw=SPW`. Per the spec these are the account's `l_user_id` / `l_password` from `userinfo`, which the plugin never fetches.
  2. The code exchange goes to the older `/premise/dsiot/login` endpoint, not the spec's `/dsioti/oauth2/token`.
  3. How the token is sent (bare or `Bearer`) and whether the terminal must be registered first are open.

## Credentials check

The reference file contains no real credentials: `mac`, `id`, `pw`, `ssid` and `name` are `<placeholders>`, and there are no tokens, secrets or email addresses in it. A test checks this so a future edit doesn't add real capture data. The repository and its history were also searched for tokens, client secrets, terminal IDs and passwords: none were found. The only fixed identifier in the code is the Daikin Smart App's public OAuth client ID (`DEFAULT_CLIENT_ID`), which is not a secret.

## Next step

Fixing the gaps changes how login and API calls work in `src/client.ts`, so per `AGENTS.md` it needs a plan in `docs/plans/` and, ideally, a test against a real purifier and account. Suggested order: call `userinfo` after login and send its `l_user_id` / `l_password` as `id` / `spw`; then move the code exchange (and probably refresh) to `/dsioti/oauth2/token`; then try both `authorization` header forms.
