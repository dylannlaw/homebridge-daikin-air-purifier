
# Homebridge Daikin Air Purifier

This is a Homebridge plugin built for Daikin Air Purifier (based on MCK70W model). 

After going through multiple plugins that are available, some of them are having issue with hitting api rate limit due to frequent API request and all of them do not support changing the air purifier setting due to deprecation of the localhost API.

I have added 60 seconds cache to prevent frequent API request and also added support of changing air purifier setting by calling `https://api.daikinsmartdb.jp`. 

However, it added complexity due to authorization is needed.


## Configuration Example
```json
{
    "accessory": "DaikinAirPurifier",
    "name": "DaikinAirPurifer",
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

## Steps to get certain configuration value
Knowledge of proxy is needed in order to get certain values while accessing [Daikin Smart App](https://apps.apple.com/app/id564109247).

`code` - It can be obtained from `https://api.daikinsmartdb.jp/premise/dsiot/login` request body during login.

`clientId` - It can be obtained from `https://api.daikinsmartdb.jp/premise/dsiot/login` request body during login.

`uuid` - It can be obtained from `https://api.daikinsmartdb.jp/premise/dsiot/login` request body during login.

`clientSecret` - It can be obtained from `https://api.daikinsmartdb.jp/premise/dsiot/login` request body during login.

`terminalId` - It can be obtained from `https://api.daikinsmartdb.jp/cleaner/set_control_info` query parameter when adjusting the air purifier control in the app.

`port` - It can be obtained from `https://api.daikinsmartdb.jp/cleaner/set_control_info` query parameter when adjusting the air purifier control in the app.



## Changelog

See [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md).
