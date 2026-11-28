# Changelog

All notable changes to this project are documented in this file. Every pull request that changes the plugin raises the version in `package.json` and adds an entry here; merging it to `master` publishes that version to npm, and the entry becomes the [GitHub Release](https://github.com/dylannlaw/homebridge-daikin-air-purifier/releases) notes.

Versions 0.2.3 and 1.0.0 to 1.0.4 were never published: the patch number used to come from the release workflow's run number.

## [2.1.3](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v2.1.2...v2.1.3) (2026-11-29)


### Documentation

* the plugin is now [Verified by Homebridge](https://github.com/homebridge/homebridge/wiki/Verified-Plugins), and the README shows the badge. The plugin itself is unchanged; this release puts the new README on npm

## [2.1.2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v2.1.1...v2.1.2) (2026-11-27)


### Bug Fixes

* if your `config.json` still has the purifier under `accessories` (the format before 2.1.0), the plugin now logs how to move it to `platforms`, just before Homebridge's "No plugin was found for the accessory" error. Before, nothing said what to change
* the PayPal donation link in `package.json` uses the `funding` format Homebridge reads, so the Homebridge UI shows it

## [2.1.1](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v2.1.0...v2.1.1) (2026-11-27)


### Bug Fixes

* the plugin settings schema lists its required fields (`name`, `cacheDuration`) at the object level, as JSON Schema requires, instead of `"required": true` on each field. The Homebridge verification checks rejected the old form. Nothing changes in your settings
* `package.json` has a `homepage` link to the README

## [2.1.0](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v2.0.0...v2.1.0) (2026-11-27)


### BREAKING CHANGES

* the plugin is now a Homebridge dynamic platform instead of an accessory plugin, as Homebridge requires for verified plugins. In your `config.json`, move the purifier's block from `accessories` to `platforms` and rename `"accessory": "DaikinAirPurifier"` to `"platform": "DaikinAirPurifier"`. Every other setting stays the same, and the saved Daikin login is kept. The Home app sees the purifier as a new accessory, so put it back in its room and redo any scenes and automations that used it


### Features

* without a local IP or a Daikin login, the plugin logs a warning and doesn't start, instead of polling nothing
* Homebridge keeps the accessory between restarts, and mode switches you turn off in `modeSwitches` are removed from it
* polling stops when Homebridge shuts down


### Bug Fixes

* when the purifier reports `-` for a sensor reading it doesn't have, HomeKit keeps the last good value instead of logging "characteristic value expected valid finite number and received NaN" warnings

## [2.0.0](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v1.1.0...v2.0.0) (2026-11-27)


### BREAKING CHANGES

* Homebridge 2.0 or later is now required. Homebridge 1.x is no longer supported: update Homebridge before updating the plugin. If you stay on 1.x, stay on version 1.1.0 of the plugin. No settings changed

## [1.1.0](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v1.0.6...v1.1.0) (2026-11-26)


### Features

* when the purifier's local IP (`host`) is set, status is read from the purifier on your network first, which answers in well under a second, and the Daikin cloud is only the fallback (at most once a minute). Before, status came from the cloud first, which can take several seconds or time out. Control still goes through the cloud. Set `host` in cloud mode for faster, more reliable status; the README now recommends it
* with `host` set, `cacheDuration` can go down to 15 seconds in cloud mode too, since status no longer makes cloud requests

## [1.0.6](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v1.0.5...v1.0.6) (2026-11-26)


### Bug Fixes

* HomeKit reads are answered at once from the last status instead of waiting on the Daikin cloud, so Homebridge no longer logs "This plugin slows down Homebridge … read handler … was slow to respond" when the cloud is slow or times out

## [1.0.5](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.2.4...v1.0.5) (2026-11-26)


### Features

* switches for the purifier's Eco, Pollen and Circulator modes, linked to the Air Purifier in the Home app; the new optional `modeSwitches` setting chooses which ones appear ([#20](https://github.com/dylannlaw/homebridge-daikin-air-purifier/pull/20))


### Documentation

* the README is a step-by-step guide, and the mode switches use the purifier's own labels ([#21](https://github.com/dylannlaw/homebridge-daikin-air-purifier/pull/21))

## [0.2.4](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.2.2...v0.2.4) (2026-11-26)


### Features

* cloud API calls follow the Daikin Smart API reference: the token, userinfo and control calls use the endpoints and bodies the Daikin Smart App uses ([#11](https://github.com/dylannlaw/homebridge-daikin-air-purifier/pull/11))
* with a Daikin login set up, status is read from the cloud; `host` is now optional and used as the fallback when a cloud read fails
* `port` is optional and read from the purifier when it's empty; startup names any missing control settings


### Documentation

* the README is split into a short overview and guides, and `npm run homebridge:local` runs the plugin in a private test Homebridge ([#14](https://github.com/dylannlaw/homebridge-daikin-air-purifier/pull/14))


### CI

* a release is made only when the plugin itself changes ([#15](https://github.com/dylannlaw/homebridge-daikin-air-purifier/pull/15))

## [0.2.2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.2.1...v0.2.2) (2026-11-26)


### CI

* test coverage is uploaded to Codecov ([#13](https://github.com/dylannlaw/homebridge-daikin-air-purifier/pull/13))

## [0.2.1](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.2.0...v0.2.1) (2026-11-26)


### Bug Fixes

* axios is updated to 1.21.1 ([#6](https://github.com/dylannlaw/homebridge-daikin-air-purifier/pull/6))


### Documentation

* control is documented as blocked on newer Daikin Smart App versions ([#3](https://github.com/dylannlaw/homebridge-daikin-air-purifier/pull/3))


### CI

* every commit to `master` that changes the plugin is released to npm ([#12](https://github.com/dylannlaw/homebridge-daikin-air-purifier/pull/12))

## [0.2.0](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.1.1...v0.2.0) (2026-10-18)


### Features

* control with your Daikin account email and password: the plugin logs in like the Daikin Smart App (OAuth with PKCE at prod-dsioti.daikinsmartdb.jp), so you no longer need to capture a single-use authorization code
* when saved tokens expire, the plugin logs in again by itself; a rejected email or password stops retries until restart so the account isn't locked
* `clientId` and `uuid` are now optional: the plugin uses the Daikin Smart App's client ID and generates its own install ID


### Documentation

* README and config UI describe control with email and password instead of documenting the plugin as read-only


### Tests

* 176 tests covering local reads and caching, local-only mode, control batching and failures, rate limiting, email/password login, token renewal, captured codes and refresh tokens, the token file, every HomeKit service and the plugin's polling. Run with `npm test`; `npm run test:coverage` reports coverage (currently 100% of lines and branches). Publishing now runs the tests first.


### CI

* fixed the GitHub Actions workflow, which failed because it tested on Node 12-16; it now tests on Node 22, 24 and 26
* releases are published to npm automatically (trusted publishing, with provenance) and tagged when package.json has a new version

### [0.1.1](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.1.0...v0.1.1) (2026-10-18)


### Documentation

* the plugin is documented as read-only: it shows sensors and status, but controlling the purifier isn't currently supported because the Daikin cloud API can't be logged in to from the plugin
* cloud control settings are marked as experimental and unsupported in the README and the config UI

## [0.1.0](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.0.6...v0.1.0) (2026-10-18)


### ⚠ BREAKING CHANGES

* requires Node.js 22, 24 or 26 and Homebridge 1.8 or 2.x. The plugin is now an ES module.


### Features

* support Homebridge 2.x (tested with Homebridge 2.4.0 and HAP-NodeJS 2.2.2)
* local-only mode: with only `host` configured, sensors and status are read from the purifier and controls are shown read-only
* sensors and status keep working when the Daikin cloud credentials are invalid; only control stops
* Daikin API tokens are saved to Homebridge storage and renewed automatically, so the single-use authorization code is only needed once
* new optional `refreshToken` setting as an alternative to `code`


### Bug Fixes

* plugin failed to load on newer Homebridge with "Cannot find module 'hap-nodejs/dist/lib/definitions/ServiceDefinitions'"
* Daikin API rate limit: control changes made within 1 second are sent as one request, and cloud calls pause for 5 minutes after HTTP 429
* local status is fetched once per `cacheDuration` and shared by all HomeKit requests, instead of once per characteristic
* cached status never expired, so HomeKit could show stale values
* cache was corrupted after changing a setting, which broke the sensors
* token renewal stopped permanently after one failed refresh
* failed control changes are reverted in HomeKit instead of showing a change that didn't happen
* temperature, humidity and water level are reported as numbers, as HAP-NodeJS 2 expects

### [0.0.6](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.0.5...v0.0.6) (2023-03-26)

### [0.0.5](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.0.4...v0.0.5) (2023-03-23)

### [0.0.4](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.0.3...v0.0.4) (2023-03-23)


### Bug Fixes

* when changing control, cache value is not updated correctly ([5915378](https://github.com/dylannlaw/homebridge-daikin-air-purifier/commit/591537814f7d567e92273b7dfb10801b25354374))

### [0.0.3](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.0.2...v0.0.3) (2023-03-23)

### [0.0.2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.0.1...v0.0.2) (2023-03-23)

### 0.0.1 (2023-03-23)


### Bug Fixes

* display wrong value ([a5f82ea](https://github.com/dylannlaw/homebridge-daikin-air-purifier/commit/a5f82ead4c331a71505045c5ab9cfeb9b105f1d9))
* humidifier status ([ce03abf](https://github.com/dylannlaw/homebridge-daikin-air-purifier/commit/ce03abf509d2157ab327b93f19ed2d3426cbd907))
* typo ([e80e1f9](https://github.com/dylannlaw/homebridge-daikin-air-purifier/commit/e80e1f9f20ff1870609540e97da6c3a99e62543c))
