
# Homebridge Daikin Air Purifier

This is a Homebridge plugin built for Daikin Air Purifier (based on MCK70W model). 

After going through multiple plugins that are available, some of them are having issue with hitting api rate limit due to frequent API request and all of them do not support changing the air purifier setting due to deprecation of the localhost API.

I have added 60 seconds cache to prevent frequent API request and also added support of changing air purifier setting by calling `https://api.daikinsmartdb.jp`. 

However, it added complexity due to authorization is needed.


## Modes

| Mode | What you need | What works |
|---|---|---|
| **Local-only** | `host` only | Sensors (temperature, humidity, air quality) and live status of power, mode, fan speed and humidifier. Controls are shown read-only in HomeKit. |
| **Local + cloud control** | `host` plus the Daikin cloud settings | Everything above, plus control: on/off, fan speed, humidifier |

Newer purifier firmware (for example `3_15_0`) no longer accepts control commands on the local network, so control has to go through the Daikin cloud (`https://api.daikinsmartdb.jp`). Reading status always uses the local network.

If the cloud credentials stop working, the plugin keeps showing sensors and status. Only control stops, and the log explains how to fix it.

## Configuration Example

Local-only:
```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifier",
    "host": "192.168.1.1",
    "cacheDuration": 60
}
```

Local + cloud control:
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

Give the purifier a fixed IP address in your router so `host` doesn't change.

## Getting the cloud settings
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
