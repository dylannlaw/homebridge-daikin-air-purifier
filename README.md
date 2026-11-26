
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

### How login works
The plugin logs in like the Daikin Smart App:
1. It starts a login session at `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/authorize` (OAuth with PKCE).
2. It sends your email and password to `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/auth`, which returns an authorization code.
3. It exchanges the code for tokens at `https://api.daikinsmartdb.jp/premise/dsiot/login`.

Tokens are saved to `<homebridge storage>/daikin-air-purifier-<name>.json` (readable only by the Homebridge user) and renewed automatically. If they expire, the plugin logs in again with your email and password. If the email or password is rejected, it stops retrying until Homebridge restarts, so your account isn't locked.

### Advanced settings
Leave these empty unless you need them:
- `clientId`: defaults to the Daikin Smart App's client ID.
- `uuid`: an app install ID. The plugin generates and keeps one.
- `code`: a single-use authorization code captured from the app, instead of email and password.
- `refreshToken`: a `refresh_token` captured from the app, instead of email and password.

### How API calls are kept low
- Status is read from the purifier on your local network once per `cacheDuration`, and that one result is shared by every HomeKit request.
- The Daikin cloud API is called only when you change a setting. Changes made within 1 second of each other (for example, dragging the fan speed slider) are sent as one request.
- If the API responds with HTTP 429, the plugin stops calling it for 5 minutes.


## Testing locally with your iPhone

You can try the plugin, including changes that aren't released yet, in a private test Homebridge on your computer and control it from the Home app on your iPhone. One command sets it all up. It doesn't touch `~/.homebridge` or a Homebridge you already run.

### What you need

- A Mac or Linux computer on the **same Wi-Fi** as your iPhone and the purifier.
- [Node.js](https://nodejs.org) 22.12 or later (`node -v` to check) and [Git](https://git-scm.com).
- The purifier's local IP address (find it in your router's list of devices).
- For control: your Daikin account email and password, `clientSecret` and `terminalId` (see [Configuration](#configuration)). Without them you can still test sensors and status.

### Step 1: Get the code

```sh
git clone https://github.com/dylannlaw/homebridge-daikin-air-purifier.git
cd homebridge-daikin-air-purifier
```

To test a branch or pull request, check it out first, for example `git checkout <branch-name>`.

### Step 2: Start the test Homebridge

```sh
npm run homebridge:local
```

On the first run the script:
1. installs the project's dependencies and builds the plugin,
2. packs it exactly as it would be published to npm,
3. installs it together with Homebridge and the Homebridge web UI into `.homebridge-local/` in the repository,
4. asks for the purifier's IP (press Enter to skip and add it in the web UI), and
5. creates a test bridge called **Daikin Test …** with its own setup code, and starts it.

Leave the terminal open: Homebridge runs until you press Ctrl+C, and its log is shown there.

### Step 3: Configure the plugin

1. Open **http://localhost:8581** in your browser. The script also prints an address you can open from your phone.
2. Create a login when asked. It only exists in this test setup.
3. Go to **Plugins**, find **Homebridge Daikin Air Purifier** and open its settings from the menu on its card.
4. Enter the purifier's IP, and for control your Daikin email, password, Client Secret, Terminal ID and Port. Click **Save**.
5. Click **Restart** (top right). Watch the log in the terminal or under **Logs** in the web UI; it says whether the purifier was reached and whether control is enabled.

### Step 4: Add it to the Home app

1. On your iPhone, open the **Home** app and tap **+ → Add Accessory**.
2. Scan the QR code on the web UI's **Status** page, or tap **More options…**, pick **Daikin Test …** and enter the setup code from the terminal.
3. Tap **Add Anyway** when iOS warns that it's an uncertified accessory, and finish the setup.

You should now see the air purifier, humidifier and the temperature, humidity and air quality sensors. Try turning it on and off and changing the fan speed, and check the result on the purifier and in the log.

### Step 5: Test a change

Edit the code, press Ctrl+C in the terminal and run `npm run homebridge:local` again. It rebuilds and reinstalls the plugin. Your settings and the pairing with your iPhone are kept, so there's no need to add it again.

Don't install or update this plugin from the web UI's **Plugins** page: that replaces your local build with the version on npm.

### Cleaning up

| Command | What it does |
|---|---|
| `npm run homebridge:local -- reset` | Forgets the HomeKit pairing but keeps your settings. Remove the bridge from the Home app first. |
| `npm run homebridge:local -- clean` | Deletes the whole test setup: config, saved Daikin tokens and pairing. Remove the bridge from the Home app too. |

### Troubleshooting

- **The Home app can't find the bridge.** Make sure your iPhone and computer are on the same Wi-Fi (not a guest network). On a Mac, allow incoming connections for "node" if the firewall asks, or allow it in **System Settings → Network → Firewall**.
- **"Address already in use" or another Homebridge is running.** Use other ports: run `npm run homebridge:local -- clean`, then `HB_UI_PORT=8582 HB_BRIDGE_PORT=51828 npm run homebridge:local`.
- **"Node.js … is too old".** Install Node.js 22 LTS or later from [nodejs.org](https://nodejs.org).
- **The accessory shows "No Response".** Check the log: the purifier's IP may be wrong or have changed. Give it a fixed IP in your router.
- **You removed the bridge from Home and can't add it again.** Run `npm run homebridge:local -- reset`, then start it again.

## Changelog

Every change to the plugin is released to npm automatically as soon as it is merged. See [Releases](https://github.com/dylannlaw/homebridge-daikin-air-purifier/releases) for what changed in each version, and the [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md) for versions up to 0.2.0.
