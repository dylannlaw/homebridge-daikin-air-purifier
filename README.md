
# Homebridge Daikin Air Purifier

This is a Homebridge plugin built for Daikin Air Purifier (based on MCK70W model). 

> **This plugin is currently read-only.** It shows the purifier's sensors and status in HomeKit, but it can't control the purifier.

## What works

| Feature | Supported |
|---|---|
| Temperature, humidity and air quality (PM2.5, dust, odour) sensors | ✅ |
| Live status of power, mode, fan speed and humidifier | ✅ |
| Control from HomeKit (on/off, fan speed, humidifier) | ❌ Not currently supported |

All you need is the purifier's local IP address (`host`). Status is read on your local network, with no account or cloud access.

## Why control isn't supported
Newer purifier firmware (for example `3_15_0`) has removed the local control endpoint (`/cleaner/set_control_info` returns 404), and it doesn't support Daikin's newer local DSIOT protocol either. The only way left to control it is through the Daikin cloud (`https://api.daikinsmartdb.jp`), which is what the Daikin Smart App uses.

That cloud API can't currently be logged in to from the plugin. Its login takes a single-use authorization code that can only be captured from the Daikin Smart App with an HTTPS proxy, and there's no known way to log in with your email and password. If control becomes possible, it will be added back as a supported feature.

The plugin still contains experimental cloud control code. See [Experimental: cloud control](#experimental-cloud-control) if you want to try it, but it isn't supported.

## Configuration Example

```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "host": "192.168.1.1",
    "cacheDuration": 60
}
```

Give the purifier a fixed IP address in your router so `host` doesn't change. `cacheDuration` is how often, in seconds, the purifier is polled (minimum 15).

In HomeKit, the control tiles are shown read-only.

## Experimental: cloud control

**Not supported.** It needs values captured from the Daikin Smart App with an HTTPS proxy, and they may stop working at any time. If the cloud credentials fail, the plugin falls back to read-only and keeps showing sensors and status.

```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "serial": "abcdefg",
    "model": "MCK70W",
    "host": "192.168.1.1",
    "code": "",
    "clientId": "",
    "uuid": "",
    "clientSecret": "",
    "terminalId": "",
    "cacheDuration": 60,
    "port": "30050"
}
```

### Getting the cloud settings
Knowledge of proxy is needed in order to get certain values while accessing [Daikin Smart App](https://apps.apple.com/app/id564109247).

`code` - It can be obtained from `https://api.daikinsmartdb.jp/premise/dsiot/login` request body during login.

`clientId` - It can be obtained from `https://api.daikinsmartdb.jp/premise/dsiot/login` request body during login.

`uuid` - It can be obtained from `https://api.daikinsmartdb.jp/premise/dsiot/login` request body during login.

`clientSecret` - It can be obtained from `https://api.daikinsmartdb.jp/premise/dsiot/login` request body during login.

`refreshToken` (optional, instead of `code`) - The `refresh_token` from the `https://api.daikinsmartdb.jp/premise/dsiot/login` or `/premise/dsiot/token` response.

`terminalId` - It can be obtained from `https://api.daikinsmartdb.jp/cleaner/set_control_info` query parameter when adjusting the air purifier control in the app.

`port` - It can be obtained from `https://api.daikinsmartdb.jp/cleaner/set_control_info` query parameter when adjusting the air purifier control in the app.

### You only capture the code once
An authorization `code` works a single time. After the first successful login the plugin saves its tokens to
`<homebridge storage>/daikin-air-purifier-<name>.json` and renews them automatically, so restarts don't need a new code.
You only need to capture a new `code` (or `refreshToken`) if the log says the saved token was rejected. When you put a new one in the config, the plugin uses it on the next restart.

### How API calls are kept low
- Status is read from the purifier on your local network once per `cacheDuration`, and that one result is shared by every HomeKit request.
- The Daikin cloud API is called only when you change a setting. Changes made within 1 second of each other (for example, dragging the fan speed slider) are sent as one request.
- If the API responds with HTTP 429, the plugin stops calling it for 5 minutes.


## Changelog

See [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md).
