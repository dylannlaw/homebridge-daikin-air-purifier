
# Homebridge Daikin Air Purifier

[![codecov](https://codecov.io/gh/dylannlaw/homebridge-daikin-air-purifier/graph/badge.svg)](https://codecov.io/gh/dylannlaw/homebridge-daikin-air-purifier)

This is a Homebridge plugin built for Daikin Air Purifier (based on MCK70W model). 

## What works

| Feature | What you need |
|---|---|
| Temperature, humidity and air quality (PM2.5, dust, odour) sensors, and live status of power, mode, fan speed and humidifier | **Either** your Daikin account (email, password, `clientSecret`) to read them from the Daikin cloud, **or** the purifier's local IP (`host`), or both |
| Control from HomeKit (on/off, fan speed, humidifier) | Your Daikin account plus `terminalId` (see [Configuration](#configuration)) |

When your Daikin account is set, status is read from the Daikin cloud (`https://api.daikinsmartdb.jp`) with the same login as control, so the local IP isn't needed. If you also set `host`, the purifier's local IP is the fallback whenever the cloud can't be reached. Without an account, status is read on your local network only. Newer purifier firmware (for example `3_15_0`) has removed local control, so control always goes through the Daikin cloud, the same way the Daikin Smart App does.

> **Cloud status and control are new and not yet confirmed working end to end.** The login follows the Daikin Smart App's current login. If it fails, the log says why, and status falls back to the local IP if it's set.

## Known limitations

**Control currently doesn't work on newer firmware.** Since the Daikin Smart App was updated, the `clientSecret` and `terminalId` that control needs can no longer be captured with an HTTPS proxy: the app rejects intercepted connections (for example with error `0406`). Without a `clientSecret`, status is read from the local IP only; without a `terminalId`, the purifier can't be controlled from HomeKit.

A way to get these credentials is being investigated. Follow [#2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/issues/2) for updates. If you already have a `clientSecret` and `terminalId` from an older capture, control may still work with them.

## Configuration

Local IP only (sensors and status, no account):
```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "host": "192.168.1.1",
    "refreshInterval": 60
}
```

Daikin cloud, with control (`host` is optional and only used as a fallback):
```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "username": "you@example.com",
    "password": "your Daikin Smart App password",
    "clientSecret": "captured once from the app",
    "terminalId": "captured once from the app",
    "host": "192.168.1.1",
    "refreshInterval": 300
}
```

| Setting | Needed for | Description |
|---|---|---|
| `host` | Required without an account; otherwise an optional fallback | The purifier's local IP address. Give it a fixed IP in your router so it doesn't change. |
| `refreshInterval` | Optional (default 60) | How often, in seconds, status is fetched. See [Refresh interval and rate limits](#refresh-interval-and-rate-limits). The older name `cacheDuration` still works. |
| `username`, `password` | **Cloud status and control** | The email and password you sign in to the [Daikin Smart App](https://apps.apple.com/app/id564109247) with. |
| `clientSecret` | **Cloud status and control** | The `client_secret` in the body of the app's `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/token` request. |
| `terminalId` | **Control** | The `terminalid` query parameter of the app's `https://api.daikinsmartdb.jp/cleaner/set_control_info` request, sent when you change a setting in the app. Cloud status works without it. |
| `port` | Optional | Leave empty: the plugin reads it from the purifier (`port=` at `http://<purifier IP>/common/basic_info`), or uses `30050` when there's no `host`. |

`clientSecret` and `terminalId` have to be captured once from the Daikin Smart App with an HTTPS proxy. After that, the plugin logs in by itself. This capture no longer works with the current app; see [Known limitations](#known-limitations).

If some of these are filled in but not all, the log names the missing settings, for example `Control is off because these settings are missing: terminalId.`

### Refresh interval and rate limits
Every refresh is one request: to the Daikin cloud when your account is set, otherwise to the purifier on your network. HomeKit reads in between are answered from the last result.

- **Local IP:** minimum 15 seconds. The purifier is on your network, so there's no account limit, but very frequent polling can still make the purifier slow to respond.
- **Daikin cloud:** minimum 60 seconds. **Refreshing too often can get your Daikin account rate-limited** (HTTP 429). When that happens the plugin pauses all cloud requests, including control, for 5 minutes, and reads status from the local IP in the meantime if `host` is set. At 60 seconds that's 1,440 cloud requests a day; 300 seconds (5 minutes) is 288. Prefer a longer interval if you don't need fast updates.

A value below the minimum is raised to it, with a warning in the log.

### How status is read
With your Daikin account set, each refresh is a `GET https://api.daikinsmartdb.jp/cleaner/get_unit_info` with the access token, `id`, `spw` and `port` (from steps 1 to 5 below). If it fails (network, server error, rate limit, a rejected login) and `host` is set, that refresh reads `http://<host>/cleaner/get_unit_info` on your network instead, and the next refresh tries the cloud again. The log notes the switch once, not on every refresh.

### How control works, end to end
Every change you make in HomeKit ends in one `https://api.daikinsmartdb.jp/cleaner/set_control_info` request. Each of its values comes from your settings or from an earlier step:

| `set_control_info` value | Where it comes from |
|---|---|
| `authorization` header | The access token from logging in (steps 1 to 3), from `username`, `password` and `clientSecret` |
| `id`, `spw` | `l_user_id` and `l_password` from `userinfo` (step 4) |
| `terminalid` | The `terminalId` setting |
| `port` | The `port` setting, or the purifier's `basic_info` (step 5) |
| `pow`, `mode`, `airvol`, `humd` | The purifier's current state, with your change applied |

The steps, the same way the Daikin Smart App does them:
1. Start a login session at `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/authorize` (OAuth with PKCE).
2. Send your email and password to `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/auth`, which returns an authorization code.
3. Exchange the code, with `clientSecret`, for tokens at `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/token`.
4. On the first cloud request (a status refresh or a change), get the account's device credentials from `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/userinfo`.
5. On the first cloud request, if `port` isn't set, read it from `http://<purifier IP>/common/basic_info` on your network (or use `30050` without `host`).
6. Send `set_control_info`. A reply of `ret=OK` means the purifier took the change.

Tokens and device credentials are saved to `<homebridge storage>/daikin-air-purifier-<name>.json` (readable only by the Homebridge user), and the port is kept until Homebridge restarts, so these steps aren't repeated on every change. Tokens are renewed automatically at the same token endpoint. If they expire, the plugin logs in again with your email and password. If the email or password is rejected, it stops retrying until Homebridge restarts, so your account isn't locked.

### Advanced settings
Leave these empty unless you need them:
- `clientId`: defaults to the Daikin Smart App's client ID.
- `uuid`: an app install ID. The plugin generates and keeps one.
- `code`: a single-use authorization code captured from the app, used with `clientSecret` instead of email and password. The current app protects its codes with PKCE, so a captured code may not work without the app's code verifier.
- `refreshToken`: a `refresh_token` captured from the app, instead of email and password.

### API reference
An unofficial OpenAPI description of the Daikin Smart API, reverse-engineered from the app's traffic, is in [`docs/reference/daikin-smart-api.openapi.yaml`](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/reference/daikin-smart-api.openapi.yaml). [This note](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/research/2026-11-26-openapi-conformance.md) explains how each of the plugin's API calls follows it, and what is still unverified.

### How API calls are kept low
- Status is read once per `refreshInterval` (from the cloud at most once a minute), and that one result is shared by every HomeKit request.
- The device credentials (`userinfo`) are fetched once and saved, and the port is read from the purifier once per restart, not on every change.
- Apart from status refreshes, the Daikin cloud API is called only when you change a setting. Changes made within 1 second of each other (for example, dragging the fan speed slider) are sent as one request.
- If the API responds with HTTP 429, the plugin stops calling it for 5 minutes.
- If the login server is down, the plugin waits 5 minutes before logging in again, instead of retrying on every refresh.


## Changelog

See [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md).
