
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

## Changelog

See [CHANGELOG](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/CHANGELOG.md).
