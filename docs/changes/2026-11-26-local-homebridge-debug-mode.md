# Run the local test Homebridge in debug mode

## Summary

`npm run homebridge:local` now always starts Homebridge with `-D`, so the plugin's debug logs show in the terminal and in the web UI's log.

## Why

When testing against a real purifier you want every log line: status reads, cloud calls, token refreshes, commands. Without `-D`, Homebridge hides `log.debug` output, so you had to find the web UI's debug toggle and restart.

## Design

The script starts Homebridge through `hb-service run`, which has no `-D` option. Each time it (re)starts Homebridge, hb-service reads `storage/.uix-hb-service-homebridge-startup.json`, the file that the web UI's **Homebridge Debug Mode -D** toggle saves, and adds `-D` when `debugMode` is true. Before starting, the script now sets `debugMode: true` in that file and keeps any other options in it (`keepOrphans`, `env`, `insecureMode`).

Options considered:

- **Running `homebridge -D` directly instead of hb-service.** Rejected: you'd lose the web UI and its Restart button, which the testing guide depends on.
- **`HOMEBRIDGE_DEBUG=1`.** hb-service only reads it with `--docker`, which also changes file permissions and other behaviour. Rejected.

If you switch debug mode off in the web UI, it stays off until the script is run again. That's on purpose: the setting belongs to this throwaway test setup.

## Files

- `scripts/local-homebridge.sh`: new `enable_debug_mode`, run on every start; the header (and so `help`) mentions debug mode.

## Docs updated

- `docs/guides/testing-locally.md`: Step 3 says the log includes debug lines.
- README: no change. It doesn't describe the script's logging.

## Verified / not verified

- ✅ `npm run lint && npm test`.
- ✅ Checked in the hb-service source in the installed `homebridge-config-ui-x` that `debugMode` in the startup options file adds `-D`.
- ✅ Ran `enable_debug_mode` against a scratch storage folder, with no file there and with an existing file that has other options: `debugMode` is set and the other options are kept.
- ❌ Not run end to end with a purifier in this change.

## Follow-ups

None.
