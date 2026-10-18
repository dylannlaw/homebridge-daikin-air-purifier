# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [0.1.1](https://github.com/dylannlaw/homebridge-daikin-air-purifier/compare/v0.1.0...v0.1.1) (2026-10-18)


### Documentation

* the plugin is documented as read-only: it shows sensors and status, but controlling the purifier isn't currently supported because the Daikin cloud API can't be logged in to from the plugin
* cloud control settings are marked as experimental and unsupported in the README and the config UI

0.1.0 was tagged on GitHub but never published to npm; 0.1.1 is the first npm release with the changes below.

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
