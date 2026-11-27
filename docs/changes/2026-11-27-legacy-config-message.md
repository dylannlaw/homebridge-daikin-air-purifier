# Explain how to migrate an old accessory config

## Summary

When Homebridge's `config.json` still has the purifier under `accessories` (`"accessory": "DaikinAirPurifier"`, the format before 2.1.0), the plugin logs the steps to move it to `platforms` as soon as it is loaded. The release also carries the `funding` change already on `master` (an object, the form Homebridge shows as a donation link). Version 2.1.2.

## Why

After upgrading to 2.1.1, the owner's Homebridge only logged `No plugin was found for the accessory "DaikinAirPurifier" in your config.json. Please make sure the corresponding plugin is installed correctly.` The plugin is installed; it is the config that is out of date, and that message doesn't say so. The upgrade note is only in the README, which Homebridge's update screen doesn't show.

The `funding` commit (70cf31d) went to `master` without a version bump, so its Release run failed (2.1.1 is already on npm). This version publishes it.

## Design

- `src/legacyConfig.ts`: `legacyConfigMessage(config)` returns the message for a config with our block under `accessories`, or null. If a `"platform": "DaikinAirPurifier"` block is also there, it says to delete the leftover block instead. It names only keys, never values from the block, so no setting or secret is logged.
- `warnAboutLegacyConfig(configPath)` reads `config.json` once and logs the message. It never throws: a missing or invalid file is Homebridge's to report.
- It runs in the plugin initializer, because with only the old block Homebridge never constructs the platform. Homebridge loads plugins before it reads the accessory blocks, so the message comes just before Homebridge's own error. The initializer gets no logger, and `Logger` is a type-only export of `homebridge`, so it uses `console.error` with a `[DaikinAirPurifier]` prefix.
- **Not** done: registering a stub `DaikinAirPurifier` accessory that logs the message. The [dynamic platform plan](../plans/dynamic-platform.md) rejected registering both an accessory and a platform (two code paths, and the verification review would still see an accessory plugin). Reading `config.json` avoids both. It only reads Homebridge's own file, and writes nothing.
- With a child bridge, Homebridge may load the plugin in the child process as well, so the message can appear twice. That is harmless and was not worth detecting.

## Files

- `src/legacyConfig.ts`: new.
- `src/index.ts`: calls `warnAboutLegacyConfig(api.user.configPath())` after registering the platform.
- `test/legacyConfig.test.mjs`: new. The message for each case, that no setting values are included, that nothing is logged for a current config or a missing or invalid file, and that the initializer checks the config.
- `README.md`: the upgrade note mentions the Homebridge error and the plugin's message.
- `package.json`, `package-lock.json`: 2.1.2. `CHANGELOG.md`, `docs/README.md`, this note.

## Docs updated

`README.md` (upgrade note), `CHANGELOG.md`, `docs/README.md`.

## Verified / not verified

- ✅ `npm run lint && npm test`: 267 tests pass.
- ✅ Real Homebridge 2.4.0 on Node 26, scratch storage, the built plugin, and a config with only the old `accessories` block (fake IP 192.0.2.1): the `[DaikinAirPurifier]` message is logged right after the plugin loads, before Homebridge's `No plugin was found for the accessory` line.
- ✅ The 2.1.1 test Homebridge with a `platforms` block ran with no new output, and read status from the Daikin cloud.
- ❌ Not checked: a child bridge, and how the Homebridge UI shows the `funding` link.

## Follow-ups

None.
