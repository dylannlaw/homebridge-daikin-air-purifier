# Become a dynamic platform, for Homebridge verification

## Summary

The plugin registers a Homebridge **dynamic platform** (`api.registerPlatform`) instead of an accessory (`api.registerAccessory`). It doesn't start when nothing is configured. It is version 3.0.0, a breaking change for existing configs.

## Why

The goal is to apply for **Verified By Homebridge**. The [requirements](https://github.com/homebridge/plugins/wiki/Verified-Plugins) (last updated 2026-11-01) were checked one by one:

| Requirement | Before | Now |
|---|---|---|
| Dynamic platform | ❌ accessory plugin | ✅ `DynamicPlatformPlugin` |
| Not the same or less functionality than an existing verified plugin | ✅ The verified Daikin plugins (`homebridge-daikin-local`, `-local-platform`, `-cloud`, `-oneplus`, `-smart-ac`, `-tempsensor-nocloud`) are for air conditioners. None supports the MCK70W purifier or the Daikin Smart App (Japan) cloud. | ✅ |
| On npm, source on GitHub, issues enabled | ✅ | ✅ |
| A GitHub release with notes for every version | ✅ `release.yml` creates `v<version>` with the CHANGELOG entry | ✅ |
| Runs on Node 22, 24 and 26 | ✅ `engines` and the CI matrix | ✅ |
| Installs, and doesn't start unless configured | ⚠️ It installed, but with no IP or login it still started and logged an error on every poll | ✅ logs one warning, makes no requests, registers no accessory |
| No post-install scripts that modify the system | ✅ none (`prepublishOnly` runs only when publishing) | ✅ |
| No TTY or non-standard startup parameters | ✅ everything is set in the settings UI | ✅ |
| Homebridge Plugin Settings GUI | ✅ `config.schema.json` | ✅ now `pluginType: platform` |
| No analytics or tracking | ✅ only the purifier and Daikin's own servers are contacted | ✅ |
| Files only in the Homebridge storage directory | ✅ the token file is in `api.user.storagePath()` | ✅ |
| No unhandled exceptions | ✅ polling, login and control catch and log their errors | ✅ |

See the [plan](../plans/dynamic-platform.md).

## Design

- The platform collects cached accessories in `configureAccessory`. On `didFinishLaunching` it finds or creates one accessory with UUID `uuid.generate('DaikinAirPurifier:' + name)`, then registers it if it is new or updates it if it came from the cache. It unregisters any other cached accessory, for example one left from an earlier `name`.
- Each service class gets the accessory and calls `serviceFor` (`src/Service/serviceFor.ts`). It reuses a cached service of that type and subtype before adding one, so a restart never adds a service twice. With no accessory (the unit tests) it creates a standalone service, as before.
- Mode switches removed from `modeSwitches` are taken off the cached accessory and unlinked from the purifier.
- `isConfigured` is true with a local IP, an email, password and Client Secret, a code with the Client Secret, or a refresh token. These are the same ways in which the client can read status. When it is false, the platform also unregisters any cached accessory, so no "No Response" tile stays behind.
- On `shutdown`, polling stops.
- The config shape is unchanged apart from `accessory` → `platform`. The token file name still comes from `name`, so the saved login carries over. A `devices` list and keeping a legacy accessory registration were considered and rejected (see the plan).
- `package.json` now has the `supports-hap` keyword, following the Homebridge transport convention.
- `scripts/local-homebridge.sh` writes a platform block. It moves a `DaikinAirPurifier` block that an older version wrote into `accessories` over to `platforms`.

## Files

- `src/index.ts`: the platform, `isConfigured`, and the purifier class with shutdown.
- `src/Service/serviceFor.ts`: new, reuses or adds a service on the accessory.
- `src/Service/*.ts`: take the accessory, use `serviceFor`, `PlatformConfig`. `ModeSwitch` removes switches that were turned off.
- `src/client.ts`: `AccessoryConfig` → `PlatformConfig` (type only).
- `config.schema.json`: `pluginType: platform`, the `accessory` field removed.
- `test/plugin.test.mjs`: rewritten for the platform. New tests cover registering, a stable UUID, reuse from the cache without duplicates, removed switches, stale accessories, not starting when unconfigured, `isConfigured`, and shutdown.
- `scripts/local-homebridge.sh`: platform config, and migration of an old test config.
- `package.json`, `package-lock.json`: 3.0.0, `supports-hap`.

## Docs updated

`README.md` (config examples, the platforms list, an upgrade note), `docs/guides/how-it-works.md` (advanced settings go in the platform block), `CHANGELOG.md`, `docs/README.md`, this note and the plan.

## Verified / not verified

- ✅ `npm run lint && npm test`: 251 tests pass.
- ✅ Real Homebridge 2.5.0 (HAP 2.3.0) on Node 26 with a scratch storage dir and an unreachable test IP (192.0.2.1):
  - Unconfigured, it logged `Not configured, so not starting` and made no requests.
  - With `host`, it registered one accessory with 9 services under `@dylannlaw/homebridge-daikin-air-purifier` / `DaikinAirPurifier`.
  - On restart, it restored the accessory from the cache with no duplicate-service errors.
- ❌ Not paired with the Home app or run against a real purifier in this change. `npm run homebridge:local` with the purifier would confirm the tiles and control.
- ❌ Not checked: what the Homebridge UI does with an existing 2.x `accessories` block. The README tells users to move it by hand.

## Follow-ups

- Open the verification request on [homebridge/plugins](https://github.com/homebridge/plugins/issues/new/choose) once 3.0.0 is on npm.
- Optionally, a plugin icon (a square PNG of about 100 px) for the request.
