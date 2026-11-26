# Describe the settings as cloud mode and local mode

## Summary

The settings page and the README now describe two modes. **Cloud mode** needs `username`, `password`, `clientSecret` and `terminalId`, and is the only way to control the purifier. **Local mode** needs only `host` and is read-only. The settings page has a separate group for each mode. No behaviour changed.

## Why

While testing in the local Homebridge, the purifier showed up in the Home app but couldn't be controlled. `terminalId` was missing, so the plugin ran read-only. The docs did say `terminalId` was needed for control, but that was easy to miss: the settings page put the local IP outside any group and labelled the account section "Daikin cloud". It wasn't clear which settings were required for control.

## Design

- `config.schema.json`: the account group is renamed "Cloud mode, recommended (status and control from HomeKit)", is shown first to encourage cloud mode, and says all four fields are required for control. Each of those four field descriptions says the same. A new "Local mode (status only, no control)" group below it holds `host`.
- `README.md`: Configuration starts with a table comparing the two modes, then has a section and example for each, then the full settings table marked by mode.
- `port` stays in the Cloud mode group and is labelled cloud mode only, because only cloud requests send it ([`src/client.ts`](../../src/client.ts) `ensurePort`). Local reads don't use it.

## Files

- `config.schema.json`: layout groups and descriptions only. No setting was added, removed or renamed.
- `README.md`: "What works" control row and the Configuration section.

## Docs updated

`README.md` and `config.schema.json`. `docs/guides/how-it-works.md` already describes which settings each call needs, so it didn't change.

## Verified / not verified

- ✅ `npm run lint && npm test` pass, and `config.schema.json` parses as valid JSON.
- ❌ I haven't looked at the new groups on the Homebridge UI settings page.
- ❌ Control on a real purifier with all four settings isn't confirmed. It depends on capturing a `terminalId`, which is limited by the [known capture problem](../../README.md#known-limitations).

## Follow-ups

None.
