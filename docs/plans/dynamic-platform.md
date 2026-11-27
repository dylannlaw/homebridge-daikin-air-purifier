# Plan: dynamic platform

Status: approved and implemented ([change note](../changes/2026-11-27-dynamic-platform.md))

## Goal

The plugin can be **Verified By Homebridge**. The [verification requirements](https://github.com/homebridge/plugins/wiki/Verified-Plugins) (last updated 2026-11-01) say the plugin must be a [dynamic platform](https://developers.homebridge.io/#/api/platform-plugins) and must not start unless it is configured. The plugin was an accessory plugin (`api.registerAccessory`), so it failed the first requirement. The rest were already met (see the change note).

## Options considered

| Option | Why / why not |
|---|---|
| Dynamic platform, one purifier per platform block, same settings (picked) | Meets the requirement. Users rename one key and move the block from `accessories` to `platforms`; every other setting, and the saved login (`daikin-air-purifier-<name>.json`), stays as it is. |
| Dynamic platform with a `devices` list | Supports several purifiers in one block, but changes the shape of every setting at once. Nobody has asked for it; it can be added later without another breaking change. |
| Register both the old accessory and the new platform | No breaking change for existing users, but two code paths to keep, and the verification review would still see an accessory plugin. |

## Design

- `src/index.ts` registers `DaikinAirPurifierPlatform` with `api.registerPlatform('DaikinAirPurifier', …)`. `config.schema.json` changes `pluginType` to `platform`, and the `accessory` setting becomes `platform`. The alias stays `DaikinAirPurifier`.
- The platform keeps the accessories Homebridge restores in `configureAccessory`. On `didFinishLaunching` it finds or creates one `PlatformAccessory`. Its UUID comes from `api.hap.uuid.generate('DaikinAirPurifier:' + name)`, so it stays the same across restarts. The platform adds the services the accessory is missing, registers it if it is new, and unregisters any cached accessory it no longer uses.
- Each service class takes the `PlatformAccessory` and reuses its existing service (`getService` / `getServiceById` for the mode switches) before adding one. Mode switches that were turned off in `modeSwitches` are removed from the cached accessory.
- **Not configured:** with neither a local IP (`host`) nor a Daikin login (email, password and Client Secret, a refresh token, or a captured code with the Client Secret), the platform logs one warning, creates no client, makes no network request, and unregisters any cached accessory, so no dead tile stays in the Home app.
- On `shutdown` the polling timer is cleared.
- Breaking change. Released as **2.1.0**, as the owner chose, rather than 3.0.0. HomeKit sees a new accessory: users must put it back in its room and redo scenes and automations. The changelog and README say so.

## Files expected to change

- `src/index.ts`, `src/Service/*.ts`, a new `src/Service/serviceFor.ts`
- `config.schema.json`, `README.md`, `docs/guides/how-it-works.md`, `scripts/local-homebridge.sh`
- `test/plugin.test.mjs`
- `CHANGELOG.md`, `package.json`, `package-lock.json`, the change note and `docs/README.md`

## Verification

`npm run lint && npm test`, with plugin tests for: registering the platform, creating and registering one accessory, reusing a cached accessory without adding duplicate services, removing disabled mode switches, removing stale cached accessories, not starting when unconfigured, and stopping polling on shutdown. Pairing in a real Home app needs `npm run homebridge:local` and a purifier.

## Open questions

None.
