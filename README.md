
<h1 align="center">Homebridge Daikin Air Purifier</h1>

<p align="center">
This is a Homebridge plugin built for Daikin Air Purifier (based on MCK70W model). 
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/npm/v/@dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="Latest version on npm"></a>
  <a href="https://www.npmjs.com/package/@dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/npm/d18m/@dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="Downloads in the last 18 months"></a>
  <a href="https://www.npmjs.com/package/@dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/npm/dm/@dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="Downloads per month"></a>
</p>

<p align="center">
  <a href="https://github.com/dylannlaw/homebridge-daikin-air-purifier/actions/workflows/tests.yml"><img src="https://github.com/dylannlaw/homebridge-daikin-air-purifier/actions/workflows/tests.yml/badge.svg?branch=master" alt="Tests on the master branch"></a>
  <a href="https://codecov.io/gh/dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/codecov/c/github/dylannlaw/homebridge-daikin-air-purifier/master?color=666666&labelColor=444444" alt="Test coverage on the master branch"></a>
  <a href="https://github.com/dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/github/stars/dylannlaw/homebridge-daikin-air-purifier?style=social" alt="Stars"></a>
</p>

## What works

| Feature | What you need |
|---|---|
| Temperature, humidity and air quality (PM2.5, dust, odour) sensors, and live status of power, mode, fan speed and humidifier | **Either** your Daikin account (email, password, `clientSecret`) to read them from the Daikin cloud, **or** the purifier's local IP (`host`), or both |
| Control from HomeKit (on/off, fan speed, humidifier) | Cloud mode: **all four of** `username`, `password`, `clientSecret` and `terminalId` (see [Configuration](#configuration)) |

When your Daikin account is set, status is read from the Daikin cloud (`https://api.daikinsmartdb.jp`) with the same login as control, so the local IP isn't needed. If you also set `host`, the purifier's local IP is the fallback whenever the cloud can't be reached. Without an account, status is read on your local network only. Newer purifier firmware (for example `3_15_0`) has removed local control, so control always goes through the Daikin cloud, the same way the Daikin Smart App does. See [How it works](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/how-it-works.md) for details.

> **Cloud status and control are new and not yet confirmed working end to end.** The login follows the Daikin Smart App's current login. If it fails, the log says why, and status falls back to the local IP if it's set.

## Known limitations

**Control currently doesn't work on newer firmware.** Since the Daikin Smart App was updated, the `clientSecret` and `terminalId` that control needs can no longer be captured with an HTTPS proxy: the app rejects intercepted connections (for example with error `0406`). Without a `clientSecret`, status is read from the local IP only; without a `terminalId`, the purifier can't be controlled from HomeKit.

[Capturing credentials with mitmproxy](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/capturing-credentials.md) describes the approach still worth trying (WireGuard mode, which the app can't bypass the way it bypasses a proxy); it hasn't been confirmed to work. Follow [#2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/issues/2) for updates. If you already have a `clientSecret` and `terminalId` from an older capture, control may still work with them.

## Installation

Search for **Homebridge Daikin Air Purifier** on the **Plugins** page of the Homebridge UI and install it, or install it from the command line:

```sh
npm install -g @dylannlaw/homebridge-daikin-air-purifier
```

Then configure it in the plugin's settings in the Homebridge UI, or in your `config.json` as below.

## Configuration

The plugin runs in one of two modes, depending on which settings you fill in.

| Mode | Required settings | What you get |
|---|---|---|
| **Cloud mode** | `username`, `password`, `clientSecret`, `terminalId` | Status from the Daikin cloud, **and control from HomeKit** |
| **Local mode** | `host` only | Status read from the purifier on your network. **No control**: the purifier is read-only in HomeKit |

### Cloud mode (status and control)

All four settings are required. If any one is missing, the purifier shows in the Home app but is **read-only**: you can see its status, but can't turn it on or off or change the fan speed or humidifier.

| Required | What it is |
|---|---|
| `username` | Your Daikin Smart App email |
| `password` | Your Daikin Smart App password |
| `clientSecret` | Captured once from the app (see below) |
| `terminalId` | Captured once from the app (see below) |

```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "cacheDuration": 60,
    "username": "you@example.com",
    "password": "your Daikin Smart App password",
    "clientSecret": "captured once from the app",
    "terminalId": "captured once from the app"
}
```

`host` and `port` are optional here. With `host` set, status is read from your network whenever the Daikin cloud can't be reached, and `port` is read from the purifier.

### Local mode (status only)

Only `host`, the purifier's local IP, is required. Leave the Daikin account settings empty. `port` isn't used in this mode.

```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "cacheDuration": 60,
    "host": "192.168.1.1"
}
```

### All settings

| Setting | Needed for | Description |
|---|---|---|
| `host` | **Required in local mode**; optional fallback in cloud mode | The purifier's local IP address. Give it a fixed IP in your router so it doesn't change. |
| `cacheDuration` | Optional (default 60) | How often, in seconds, status is fetched. See [Cache duration and rate limits](#cache-duration-and-rate-limits) below. |
| `username`, `password` | **Required for control**; also cloud status | The email and password you sign in to the [Daikin Smart App](https://apps.apple.com/app/id564109247) with. |
| `clientSecret` | **Required for control**; also cloud status | The `client_secret` in the body of the app's `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/token` request. |
| `terminalId` | **Required for control** | The `terminalid` query parameter of the app's `https://api.daikinsmartdb.jp/cleaner/set_control_info` request, sent when you change a setting in the app. Cloud status works without it. |
| `port` | Optional, cloud mode only | Leave empty: the plugin reads it from the purifier (`port=` at `http://<purifier IP>/common/basic_info`), or uses `30050` when there's no `host`. |

`clientSecret` and `terminalId` have to be captured once from the Daikin Smart App's traffic; [Capturing credentials with mitmproxy](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/capturing-credentials.md) shows how. After that, the plugin logs in by itself. This capture may not work with the current app; see [Known limitations](#known-limitations).

If some of the control settings are filled in but not all, the log says `Running in read-only mode` and names the missing ones, for example `Control is off because these settings are missing: terminalId.`

Advanced settings (`clientId`, `uuid`, `code`, `refreshToken`) are described in [How it works](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/how-it-works.md#advanced-settings). Leave them empty unless you need them.

### Cache duration and rate limits
Every refresh is one request: to the Daikin cloud when your account is set, otherwise to the purifier on your network. HomeKit reads in between are answered from the last result.

- **Local IP:** minimum 15 seconds. The purifier is on your network, so there's no account limit, but very frequent polling can still make the purifier slow to respond.
- **Daikin cloud:** minimum 60 seconds. **Refreshing too often can get your Daikin account rate-limited** (HTTP 429). When that happens the plugin pauses all cloud requests, including control, for 5 minutes, and reads status from the local IP in the meantime if `host` is set. At 60 seconds that's 1,440 cloud requests a day; 300 seconds (5 minutes) is 288. Prefer a longer interval if you don't need fast updates.

A value below the minimum is raised to it, with a warning in the log.

## More documentation

| Guide | Read it to |
|---|---|
| [How it works](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/how-it-works.md) | Understand how status is read (cloud first, local IP as fallback), how each `set_control_info` value is obtained, how the plugin logs in and stores tokens, how it keeps API calls low, the advanced settings, and the API reference. |
| [Capturing credentials with mitmproxy](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/capturing-credentials.md) | Read `clientSecret` and `terminalId` from the Daikin Smart App's traffic with mitmproxy, and what to do if the app refuses the connection. |
| [Testing locally with your iPhone](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/testing-locally.md) | Try the plugin, or a change that isn't released yet, in a private test Homebridge on your computer and the Home app on your iPhone, with one command. |
| [Security policy](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/SECURITY.md) | Report a security problem privately. |
| [Contributing](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/AGENTS.md) | Change the plugin: the workflow, checks and docs every change follows. |

## Changelog

Every change to the plugin is released to npm automatically as soon as it is merged. See [Releases](https://github.com/dylannlaw/homebridge-daikin-air-purifier/releases) for what changed in each version, and the [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md) for versions up to 0.2.0.
