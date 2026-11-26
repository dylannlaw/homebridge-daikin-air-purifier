
# Homebridge Daikin Air Purifier

[![codecov](https://codecov.io/gh/dylannlaw/homebridge-daikin-air-purifier/graph/badge.svg)](https://codecov.io/gh/dylannlaw/homebridge-daikin-air-purifier)

This is a Homebridge plugin built for Daikin Air Purifier (based on MCK70W model). 

## What works

| Feature | What you need |
|---|---|
| Temperature, humidity and air quality (PM2.5, dust, odour) sensors | The purifier's local IP (`host`) |
| Live status of power, mode, fan speed and humidifier | The purifier's local IP (`host`) |
| Control from HomeKit (on/off, fan speed, humidifier) | Also your Daikin account email and password, `clientSecret` and `terminalId` (see [Configuration](#configuration)) |

Status is always read on your local network. Newer purifier firmware (for example `3_15_0`) has removed local control, so control goes through the Daikin cloud (`https://api.daikinsmartdb.jp`), the same way the Daikin Smart App does.

> **Control is new and not yet confirmed working end to end.** The email/password login follows the Daikin Smart App's current login. If it fails, the log says why, and sensors and status keep working.

## Known limitations

**Control currently doesn't work on newer firmware.** Since the Daikin Smart App was updated, the `clientSecret` and `terminalId` that control needs can no longer be captured with an HTTPS proxy: the app rejects intercepted connections (for example with error `0406`). Without them the plugin runs in local-only mode, where sensors and status work but the purifier can't be controlled from HomeKit.

A way to get these credentials is being investigated. Follow [#2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/issues/2) for updates. If you already have a `clientSecret` and `terminalId` from an older capture, control may still work with them.

## Configuration

Read-only (sensors and status):
```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "host": "192.168.1.1",
    "cacheDuration": 60
}
```

With control (the four settings marked required below are all needed):
```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "host": "192.168.1.1",
    "username": "you@example.com",
    "password": "your Daikin Smart App password",
    "clientSecret": "captured once from the app",
    "terminalId": "captured once from the app",
    "cacheDuration": 60
}
```

| Setting | Needed for | Description |
|---|---|---|
| `host` | **Required** | The purifier's local IP address. Give it a fixed IP in your router so it doesn't change. |
| `cacheDuration` | Optional (default 60) | How often, in seconds, the purifier is polled (minimum 15). |
| `username`, `password` | **Required for control** | The email and password you sign in to the [Daikin Smart App](https://apps.apple.com/app/id564109247) with. |
| `clientSecret` | **Required for control** | The `client_secret` in the body of the app's `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/token` request. |
| `terminalId` | **Required for control** | The `terminalid` query parameter of the app's `https://api.daikinsmartdb.jp/cleaner/set_control_info` request, sent when you change a setting in the app. |
| `port` | Optional | Leave empty: the plugin reads it from the purifier (`port=` at `http://<purifier IP>/common/basic_info`, usually `30050`). Set it only if that page can't be reached. |

`clientSecret` and `terminalId` have to be captured once from the Daikin Smart App with an HTTPS proxy. After that, the plugin logs in by itself. This capture no longer works with the current app; see [Known limitations](#known-limitations).

If some of these are filled in but not all, the plugin starts in local-only mode and the log names the missing settings, for example `Control is off because these settings are missing: clientSecret, terminalId.`

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
4. On the first change, get the account's device credentials from `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/userinfo`.
5. On the first change, if `port` isn't set, read it from `http://<purifier IP>/common/basic_info` on your network.
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
- Status is read from the purifier on your local network once per `cacheDuration`, and that one result is shared by every HomeKit request.
- The device credentials (`userinfo`) are fetched once and saved, and the port is read from the purifier once per restart, not on every change.
- The Daikin cloud API is called only when you change a setting. Changes made within 1 second of each other (for example, dragging the fan speed slider) are sent as one request.
- If the API responds with HTTP 429, the plugin stops calling it for 5 minutes.


## Changelog

See [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md).
