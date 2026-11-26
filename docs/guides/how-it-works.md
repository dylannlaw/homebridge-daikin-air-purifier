# How it works

> Part of the [Homebridge Daikin Air Purifier](../../README.md) docs. See also [Testing locally](testing-locally.md) and [Capturing credentials](capturing-credentials.md).

## Cloud status, local fallback, cloud control

When your Daikin account is set (`username`, `password`, `clientSecret`), status is read from the Daikin cloud (`https://api.daikinsmartdb.jp`) with the same login as control, and the purifier's local IP (`host`) is only a fallback. Without an account, status is read from the purifier on your local network, at `http://<purifier IP>/cleaner/…`. Newer purifier firmware (for example `3_15_0`) has removed local control, so changes you make in HomeKit always go through the Daikin cloud, the same way the Daikin Smart App does. That's why control needs your Daikin account and `terminalId`.

## How status is read
With your Daikin account set, each refresh is a `GET https://api.daikinsmartdb.jp/cleaner/get_unit_info` with the access token, `id`, `spw` and `port` (from the steps in [How control works, end to end](#how-control-works-end-to-end)). If it fails (network, server error, rate limit, a rejected login) and `host` is set, that refresh reads `http://<host>/cleaner/get_unit_info` on your network instead, and the next refresh tries the cloud again. The log notes the switch once, not on every refresh.

## How control works, end to end
Every change you make in HomeKit ends in one `https://api.daikinsmartdb.jp/cleaner/set_control_info` request. Each of its values comes from your settings or from an earlier step:

| `set_control_info` value | Where it comes from |
|---|---|
| `authorization` header | The access token from logging in (steps 1 to 3), from `username`, `password` and `clientSecret` |
| `id`, `spw` | `l_user_id` and `l_password` from `userinfo` (step 4) |
| `terminalid` | The `terminalId` setting |
| `port` | The `port` setting, or the purifier's `basic_info` (step 5) |
| `pow`, `mode`, `airvol`, `humd` | The purifier's current state, with your change applied |

The mode switches send `mode` 2 (Eco), 3 (Pollen) or 5 (Circulator) with `airvol=0` and power on, and `mode` 1 (Smart, HomeKit's Auto) when the current mode's switch is turned off. These mode numbers come from the plugin's original code and haven't been confirmed against the [API reference](#api-reference), which doesn't map them yet.

The steps, the same way the Daikin Smart App does them:
1. Start a login session at `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/authorize` (OAuth with PKCE).
2. Send your email and password to `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/auth`, which returns an authorization code.
3. Exchange the code, with `clientSecret`, for tokens at `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/token`.
4. On the first cloud request (a status refresh or a change), get the account's device credentials from `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/userinfo`.
5. On the first cloud request, if `port` isn't set, read it from `http://<purifier IP>/common/basic_info` on your network (or use `30050` without `host`).
6. Send `set_control_info`. A reply of `ret=OK` means the purifier took the change.

Tokens and device credentials are saved to `<homebridge storage>/daikin-air-purifier-<name>.json` (readable only by the Homebridge user), and the port is kept until Homebridge restarts, so these steps aren't repeated on every change. Tokens are renewed automatically at the same token endpoint. If they expire, the plugin logs in again with your email and password. If the email or password is rejected, it stops retrying until Homebridge restarts, so your account isn't locked.

## How API calls are kept low
- Status is read once per `cacheDuration` (from the cloud at most once a minute), and that one result is shared by every HomeKit request.
- The device credentials (`userinfo`) are fetched once and saved, and the port is read from the purifier once per restart, not on every change.
- Apart from status refreshes, the Daikin cloud API is called only when you change a setting. Changes made within 1 second of each other (for example, dragging the fan speed slider) are sent as one request.
- If the API responds with HTTP 429, the plugin stops calling it for 5 minutes.
- If the login server is down, the plugin waits 5 minutes before logging in again, instead of retrying on every refresh.

## Advanced settings
Leave these empty unless you need them:
- `clientId`: defaults to the Daikin Smart App's client ID.
- `uuid`: an app install ID. The plugin generates and keeps one.
- `code`: a single-use authorization code captured from the app, used with `clientSecret` instead of email and password. The current app protects its codes with PKCE, so a captured code may not work without the app's code verifier.
- `refreshToken`: a `refresh_token` captured from the app, instead of email and password.

These go in the same accessory block as the other settings in your Homebridge `config.json`, or in the plugin's settings in the Homebridge UI.

## API reference
An unofficial OpenAPI description of the Daikin Smart API, reverse-engineered from the app's traffic, is in [`docs/reference/daikin-smart-api.openapi.yaml`](../reference/daikin-smart-api.openapi.yaml). [This note](../research/2026-11-26-openapi-conformance.md) explains how each of the plugin's API calls follows it, and what is still unverified.
