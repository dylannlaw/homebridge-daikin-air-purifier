
# Homebridge Daikin Air Purifier

This is a Homebridge plugin built for Daikin Air Purifier (based on MCK70W model). 

## What works

| Feature | What you need |
|---|---|
| Temperature, humidity and air quality (PM2.5, dust, odour) sensors | The purifier's local IP (`host`) |
| Live status of power, mode, fan speed and humidifier | The purifier's local IP (`host`) |
| Control from HomeKit (on/off, fan speed, humidifier) | Also your Daikin account email and password, plus the cloud settings below |

Status is always read on your local network. Newer purifier firmware (for example `3_15_0`) has removed local control, so control goes through the Daikin cloud (`https://api.daikinsmartdb.jp`), the same way the Daikin Smart App does.

> **Control is new and not yet confirmed working end to end.** The email/password login follows the Daikin Smart App's current login. If it fails, the log says why, and sensors and status keep working.

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

`clientSecret` and `terminalId` have to be captured once from the Daikin Smart App with an HTTPS proxy. After that, the plugin logs in by itself.

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


## Changelog

See [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md).
