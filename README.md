
# Homebridge Daikin Air Purifier

<p>
  <a href="https://www.npmjs.com/package/@dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/npm/v/@dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="Latest version on npm"></a>
  <a href="https://www.npmjs.com/package/@dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/npm/d18m/@dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="Downloads in the last 18 months"></a>
  <a href="https://www.npmjs.com/package/@dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/npm/dm/@dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="Downloads per month"></a>
  <a href="https://github.com/dylannlaw/homebridge-daikin-air-purifier/actions/workflows/tests.yml"><img src="https://github.com/dylannlaw/homebridge-daikin-air-purifier/actions/workflows/tests.yml/badge.svg?branch=master" alt="Tests on the master branch"></a>
  <a href="https://github.com/dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/github/stars/dylannlaw/homebridge-daikin-air-purifier?style=social" alt="Stars"></a>
  <img src="https://img.shields.io/badge/homebridge-1.8%2B%20%7C%202.x-666666?labelColor=444444" alt="Homebridge 1.8+ or 2.x">
  <img src="https://img.shields.io/node/v/@dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="Supported Node.js versions">
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-Apache--2.0-666666?labelColor=444444" alt="Apache 2.0 license"></a>
</p>

This is a Homebridge plugin built for Daikin Air Purifier (based on MCK70W model). 

## What works

| Feature | What you need |
|---|---|
| Temperature, humidity and air quality (PM2.5, dust, odour) sensors | The purifier's local IP (`host`) |
| Live status of power, mode, fan speed and humidifier | The purifier's local IP (`host`) |
| Control from HomeKit (on/off, fan speed, humidifier) | Also your Daikin account email and password, plus the cloud settings below |

Status is always read on your local network. Newer purifier firmware (for example `3_15_0`) has removed local control, so control goes through the Daikin cloud (`https://api.daikinsmartdb.jp`), the same way the Daikin Smart App does. See [How it works](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/how-it-works.md) for details.

> **Control is new and not yet confirmed working end to end.** The email/password login follows the Daikin Smart App's current login. If it fails, the log says why, and sensors and status keep working.

## Known limitations

**Control currently doesn't work on newer firmware.** Since the Daikin Smart App was updated, the `clientSecret` and `terminalId` that control needs can no longer be captured with an HTTPS proxy: the app rejects intercepted connections (for example with error `0406`). Without them the plugin runs in local-only mode, where sensors and status work but the purifier can't be controlled from HomeKit.

A way to get these credentials is being investigated. Follow [#2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/issues/2) for updates. If you already have a `clientSecret` and `terminalId` from an older capture, control may still work with them.

## Installation

Search for **Homebridge Daikin Air Purifier** on the **Plugins** page of the Homebridge UI and install it, or install it from the command line:

```sh
npm install -g @dylannlaw/homebridge-daikin-air-purifier
```

Then configure it in the plugin's settings in the Homebridge UI, or in your `config.json` as below.

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

With control:
```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "host": "192.168.1.1",
    "username": "you@example.com",
    "password": "your Daikin Smart App password",
    "clientSecret": "",
    "terminalId": "",
    "port": "30050",
    "cacheDuration": 60
}
```

| Setting | Description |
|---|---|
| `host` | The purifier's local IP address. Give it a fixed IP in your router so it doesn't change. |
| `cacheDuration` | How often, in seconds, the purifier is polled (minimum 15). |
| `username`, `password` | The email and password you sign in to the [Daikin Smart App](https://apps.apple.com/app/id564109247) with. |
| `clientSecret` | The `client_secret` from the app's `https://api.daikinsmartdb.jp/premise/dsiot/login` request body. |
| `terminalId` | The `terminalid` query parameter of the app's `https://api.daikinsmartdb.jp/cleaner/set_control_info` request, sent when you change a setting in the app. |
| `port` | Usually `30050`. It's also shown as `port=` at `http://<purifier IP>/common/basic_info`. |

`clientSecret` and `terminalId` have to be captured once from the Daikin Smart App with an HTTPS proxy. After that, the plugin logs in by itself. This capture no longer works with the current app; see [Known limitations](#known-limitations).

Advanced settings (`clientId`, `uuid`, `code`, `refreshToken`) are described in [How it works](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/how-it-works.md#advanced-settings). Leave them empty unless you need them.

## More documentation

| Guide | Read it to |
|---|---|
| [How it works](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/how-it-works.md) | Understand how status and control work, how the plugin logs in and stores tokens, how it keeps API calls low, and the advanced settings. |
| [Testing locally with your iPhone](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/testing-locally.md) | Try the plugin, or a change that isn't released yet, in a private test Homebridge on your computer and the Home app on your iPhone, with one command. |
| [Security policy](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/SECURITY.md) | Report a security problem privately. |
| [Contributing](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/AGENTS.md) | Change the plugin: the workflow, checks and docs every change follows. |

## Changelog

Every change to the plugin is released to npm automatically as soon as it is merged. See [Releases](https://github.com/dylannlaw/homebridge-daikin-air-purifier/releases) for what changed in each version, and the [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md) for versions up to 0.2.0.
