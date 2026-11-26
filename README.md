<h1 align="center">Homebridge Daikin Air Purifier</h1>

<p align="center">
  Bring your Daikin air purifier into Apple Home: see the air in your room and control the purifier from your iPhone, Siri and automations.<br>
  <a href="#get-started"><b>⬇︎ Install the plugin</b></a>
  · Free · Built for the Daikin MCK70W · Tested on firmware 3.17.0-g4 · Homebridge 1.8+ or 2.x
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/npm/v/@dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="Latest version on npm"></a>
  <a href="https://www.npmjs.com/package/@dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/npm/dm/@dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="Downloads per month"></a>
  <a href="https://github.com/dylannlaw/homebridge-daikin-air-purifier/actions/workflows/tests.yml"><img src="https://github.com/dylannlaw/homebridge-daikin-air-purifier/actions/workflows/tests.yml/badge.svg?branch=master" alt="Tests on the master branch"></a>
  <a href="https://codecov.io/gh/dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/codecov/c/github/dylannlaw/homebridge-daikin-air-purifier/master?color=666666&labelColor=444444" alt="Test coverage on the master branch"></a>
  <a href="https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/LICENSE"><img src="https://img.shields.io/github/license/dylannlaw/homebridge-daikin-air-purifier?color=666666&labelColor=444444" alt="License"></a>
  <a href="https://github.com/dylannlaw/homebridge-daikin-air-purifier"><img src="https://img.shields.io/github/stars/dylannlaw/homebridge-daikin-air-purifier?style=social" alt="Stars"></a>
</p>

## Contents

- [What it can do](#what-it-can-do)
- [Before you start](#before-you-start)
- [Get started](#get-started)
- [Configure it](#configure-it)
- [Using it in the Home app](#using-it-in-the-home-app)
- [Limitations](#limitations)
- [Good to know](#good-to-know)
- [More documentation](#more-documentation)
- [Contributing and releases](#contributing-and-releases)

## What it can do

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🌡️ See the air in your room</h3>
      Temperature, humidity and air quality (PM2.5, dust and odour) show up as sensors in the Home app, ready for automations like "turn the purifier on when air quality drops".
    </td>
    <td width="50%" valign="top">
      <h3>📊 Live purifier status</h3>
      Whether it's on, its mode, fan speed and humidifier are kept up to date, read from the Daikin cloud or straight from the purifier on your network.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🎛️ Control from HomeKit and Siri</h3>
      Turn it on or off, change the fan speed and switch the humidifier from the Home app, Siri, Control Center or a scene. Needs <a href="#cloud-mode-status-and-control">cloud mode</a>.
    </td>
    <td width="50%" valign="top">
      <h3>💧 Humidifier control</h3>
      The humidifier gets its own tile next to the purifier, to turn humidifying on or off and set its strength (Low, Standard or High). Needs <a href="#cloud-mode-status-and-control">cloud mode</a>.
    </td>
  </tr>
  <tr>
    <td colspan="2" valign="top">
      <h3>🍃 Eco, Pollen and Circulator modes</h3>
      Daikin's own modes each get a switch next to the purifier, so you can pick one with a tap. See <a href="#mode-switches">Mode switches</a>.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>🔁 Cloud first, local fallback</h3>
      With your Daikin account set, status comes from the Daikin cloud. Add the purifier's local IP and it takes over whenever the cloud can't be reached.
    </td>
    <td width="50%" valign="top">
      <h3>🛡️ Gentle on your Daikin account</h3>
      Signs in by itself, reuses its tokens, caches status and backs off when Daikin says slow down, so your account isn't rate-limited or locked. See <a href="#how-often-it-checks-and-rate-limits">rate limits</a>.
    </td>
  </tr>
</table>

## Before you start

You need:

1. **A Daikin air purifier** on your Wi-Fi and set up in the [Daikin Smart App](https://apps.apple.com/app/id564109247). The plugin is built and tested with the **MCK70W** on firmware **3.17.0-g4**. To see your purifier's firmware, open the purifier in the Daikin Smart App and go to its **Model information** section.
2. **Homebridge** 1.8 or later (or 2.x) running on Node.js 22, 24 or 26. New to Homebridge? Start with the [Homebridge install guide](https://github.com/homebridge/homebridge/wiki).
3. **Then pick what you want** (you can change it later):

| You want | Mode | You'll need |
|---|---|---|
| Sensors, status **and control** from HomeKit | **Cloud mode** | Your Daikin Smart App email and password, plus a `clientSecret` and `terminalId` captured once from the app |
| Sensors and status only (read-only) | **Local mode** | The purifier's local IP address, shown in the Daikin Smart App under **Model information** |

## Get started

1. **Install the plugin.** In the Homebridge UI, open **Plugins**, search for **Homebridge Daikin Air Purifier** and click **Install**. Or, from the command line:

   ```sh
   npm install -g @dylannlaw/homebridge-daikin-air-purifier
   ```

2. **Find the purifier's local IP address.** In the Daikin Smart App, open the purifier and go to its **Model information** section: the IP address is listed there. Local mode needs it, and cloud mode uses it as a fallback.
3. **Give the purifier a fixed IP** (recommended). In your router, reserve that IP address for the purifier so it doesn't change.
4. **Configure it.** Open the plugin's **Settings** in the Homebridge UI and fill in the fields for your mode, or edit `config.json` as shown in [Configure it](#configure-it).
5. **Restart Homebridge.** The purifier and its sensors appear in the Home app, in the room of your Homebridge bridge. Move them to the right room if you like.
6. **Check the log.** If control is off, the log says `Running in read-only mode` and names the missing settings, for example `Control is off because these settings are missing: terminalId.`

## Configure it

### Cloud mode (status and control)

All four of `username`, `password`, `clientSecret` and `terminalId` are required. If any one is missing, the purifier still shows in the Home app but is **read-only**: you can see its status, but not turn it on or off or change the fan speed or humidifier.

1. Enter the **email** and **password** you sign in to the Daikin Smart App with.
2. Capture `clientSecret` and `terminalId` once from the app's traffic: [Capturing credentials with mitmproxy](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/capturing-credentials.md) shows how. After that, the plugin logs in by itself.
3. Optionally add `host`, the purifier's local IP, as a fallback.

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

### Local mode (status only)

Only `host`, the purifier's local IP, is required. Leave the Daikin account settings empty.

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
| `host` | **Required in local mode**; optional fallback in cloud mode | The purifier's local IP address, shown in the Daikin Smart App under the purifier's **Model information**. Give it a fixed IP in your router so it doesn't change. |
| `cacheDuration` | Optional (default 60) | How often, in seconds, status is fetched. See [How often it checks, and rate limits](#how-often-it-checks-and-rate-limits). |
| `modeSwitches` | Optional (default all three) | Which Daikin modes get a switch in HomeKit: `eco`, `pollen`, `circulator`. `[]` shows none. See [Mode switches](#mode-switches). |
| `username`, `password` | **Required for control**; also cloud status | The email and password you sign in to the [Daikin Smart App](https://apps.apple.com/app/id564109247) with. |
| `clientSecret` | **Required for control**; also cloud status | The `client_secret` in the body of the app's `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/token` request. |
| `terminalId` | **Required for control** | The `terminalid` query parameter of the app's `https://api.daikinsmartdb.jp/cleaner/set_control_info` request, sent when you change a setting in the app. Cloud status works without it. |
| `port` | Optional, cloud mode only | Leave empty: the plugin reads it from the purifier (`port=` at `http://<purifier IP>/common/basic_info`), or uses `30050` when there's no `host`. Not used in local mode. |

Advanced settings (`clientId`, `uuid`, `code`, `refreshToken`) are described in [How it works](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/how-it-works.md#advanced-settings). Leave them empty unless you need them.

## Using it in the Home app

- **The purifier tile** turns the purifier on or off. Open it to set the fan speed and switch between Auto and Manual.
- **The humidifier** has its own tile, shown with the purifier, to turn humidifying on or off and set its strength with a slider: up to 33% is Low, up to 66% Standard, and above that High (cloud mode). 0% turns humidifying off.
- **Sensors** for temperature, humidity and air quality appear alongside it and can trigger automations.

### Mode switches

HomeKit's Air Purifier only has Auto and Manual, so Daikin's Eco, Pollen and Circulator modes each get a switch, shown with the purifier in the Home app. Only the switch for the current mode is on:

- Turning one on puts the purifier in that mode (turning it on if it's off) and turns the others off. In these modes the purifier picks its own fan speed.
- Turning off the current mode's switch puts the purifier back in Auto.
- Moving the fan speed slider switches to manual fan speed, so the mode switches turn off.

Each change is one request, like any other control. In local mode, or without the control settings, the switches only show the current mode. Use `modeSwitches` to choose which switches appear.

## Limitations

- **No local control.** Newer purifier firmware (for example `3_15_0`) has removed local control, so control always goes through the Daikin cloud, the same way the Daikin Smart App does. Local mode is read-only.
- **Cloud status and control are new** and not yet confirmed working end to end. The login follows the Daikin Smart App's current login. If it fails, the log says why, and status falls back to the local IP if it's set.
- **One model and firmware tested.** Only the MCK70W on firmware 3.17.0-g4 has been tested. Other firmware versions and other Daikin purifiers that use the Daikin Smart App may work, but aren't confirmed.

## Good to know

### How often it checks, and rate limits

Every refresh is one request: to the Daikin cloud when your account is set, otherwise to the purifier on your network. HomeKit reads in between are answered from the last result.

- **Local IP:** minimum 15 seconds. There's no account limit, but very frequent polling can make the purifier slow to respond.
- **Daikin cloud:** minimum 60 seconds. **Refreshing too often can get your Daikin account rate-limited** (HTTP 429). When that happens the plugin pauses all cloud requests, including control, for 5 minutes, and reads status from the local IP in the meantime if `host` is set. At 60 seconds that's 1,440 cloud requests a day; 300 seconds (5 minutes) is 288. Prefer a longer interval if you don't need fast updates.

A value below the minimum is raised to it, with a warning in the log.

### Your account and privacy

- Your Daikin email, password, `clientSecret` and `terminalId` stay in your Homebridge config and are never written to the log.
- Status comes from `https://api.daikinsmartdb.jp`, the same Daikin service the app uses. Without an account, nothing leaves your network.
- Found a security problem? Please report it privately, as described in the [Security policy](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/SECURITY.md).

## More documentation

| Guide | Read it to |
|---|---|
| 📖 [How it works](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/how-it-works.md) | Understand how status is read (cloud first, local IP as fallback), how control works end to end, how the plugin logs in and stores tokens, how it keeps API calls low, the advanced settings, and the API reference. |
| 🔑 [Capturing credentials with mitmproxy](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/capturing-credentials.md) | Read `clientSecret` and `terminalId` from the Daikin Smart App's traffic, step by step, and what to do if the app refuses the connection. |
| 📱 [Testing locally with your iPhone](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/guides/testing-locally.md) | Try the plugin, or a change that isn't released yet, in a private test Homebridge on your computer and the Home app on your iPhone, with one command. |
| 🛡️ [Security policy](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/SECURITY.md) | Report a security problem privately. |
| 🗂️ [Project docs index](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/docs/README.md) | Browse the plans, change notes and research behind every change. |

## Contributing and releases

Ideas and fixes are welcome. [Contributing](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/AGENTS.md) explains the workflow, checks and docs every change follows.

Every change to the plugin is released to npm automatically as soon as it is merged. See [Releases](https://github.com/dylannlaw/homebridge-daikin-air-purifier/releases) for what changed in each version, and the [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md) for versions up to 0.2.0.
