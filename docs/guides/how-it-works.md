# How it works

> Part of the [Homebridge Daikin Air Purifier](../../README.md) docs. See also [Testing locally](testing-locally.md).

## Local status, cloud control

Sensors and status are always read from the purifier on your local network, at `http://<purifier IP>/cleaner/…`. Newer purifier firmware (for example `3_15_0`) has removed local control, so changes you make in HomeKit go through the Daikin cloud (`https://api.daikinsmartdb.jp`), the same way the Daikin Smart App does. That is why control needs your Daikin account, and sensors don't.

## How login works

The plugin logs in like the Daikin Smart App:
1. It starts a login session at `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/authorize` (OAuth with PKCE).
2. It sends your email and password to `https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/auth`, which returns an authorization code.
3. It exchanges the code for tokens at `https://api.daikinsmartdb.jp/premise/dsiot/login`.

Tokens are saved to `<homebridge storage>/daikin-air-purifier-<name>.json` (readable only by the Homebridge user) and renewed automatically. If they expire, the plugin logs in again with your email and password. If the email or password is rejected, it stops retrying until Homebridge restarts, so your account isn't locked.

## How API calls are kept low

- Status is read from the purifier on your local network once per `cacheDuration`, and that one result is shared by every HomeKit request.
- The Daikin cloud API is called only when you change a setting. Changes made within 1 second of each other (for example, dragging the fan speed slider) are sent as one request.
- If the API responds with HTTP 429, the plugin stops calling it for 5 minutes.

## Advanced settings

Leave these empty unless you need them:
- `clientId`: defaults to the Daikin Smart App's client ID.
- `uuid`: an app install ID. The plugin generates and keeps one.
- `code`: a single-use authorization code captured from the app, instead of email and password.
- `refreshToken`: a `refresh_token` captured from the app, instead of email and password.

These go in the same accessory block as the other settings in your Homebridge `config.json`, or in the plugin's settings in the Homebridge UI.
