# Script to test the plugin in a local Homebridge

## Summary

`npm run homebridge:local` (`scripts/local-homebridge.sh`) builds the plugin, installs it with Homebridge and the Homebridge web UI into `.homebridge-local/`, and starts a private test bridge that can be configured in the browser and paired with the Home app on an iPhone.

## Why

Control can only be checked against a real purifier, Daikin account and HomeKit. Until now that meant installing a development build into your everyday Homebridge by hand. The request was a script to set up a local Homebridge, install this plugin, configure it and test it from an iPhone.

## Design

- **Isolated.** Everything lives in `.homebridge-local/` (ignored by git and npm): `plugins/` holds the packages, `storage/` the config, pairing and the plugin's token file. Homebridge runs with `-U storage -P plugins/node_modules --strict-plugin-resolution`, so `~/.homebridge` and globally installed plugins are never used.
- **Tests what ships.** The plugin is installed from an `npm pack` tarball, so files missing from the package (`.npmignore`, `files`) show up here instead of after a release. It is reinstalled every run, so a rerun picks up code changes.
- **Same Homebridge as the tests.** Homebridge is installed at the exact version in the project's `node_modules` (the devDependency).
- **Web UI.** `homebridge-config-ui-x@^5` is installed alongside, and the script runs its `hb-service run` launcher. Config UI X 5 no longer starts its web server when loaded as a plain platform by `homebridge` (checked: nothing listened on 8581), so `hb-service` is needed. It also restarts Homebridge when you press Restart in the UI. `hb-service` refuses to run as root, so the script passes `--allow-root` only when it is run as root, with a warning.
- **First-run config.** A new bridge with a random ID (`0E:…`), a random setup code that avoids the codes HomeKit rejects, ports 51827 (bridge) and 8581 (UI), the UI platform, and the purifier if you give its IP. Credentials are entered in the web UI, not the script, so they never pass through shell history or arguments. `config.json` is written with mode 600.
- **`reset`** deletes the pairing (`persist/`, `accessories/`) and gives the bridge a new ID so iOS sees a new accessory; **`clean`** deletes the whole folder after asking.
- Written for bash 3.2 (the one in macOS) and Linux; JSON is handled with `node -e`, so `jq` isn't needed.

Considered and not picked:

- **`npm link` into a global Homebridge** (what `npm run watch` and `nodemon.json` do). Needs a global install, touches `~/.homebridge`, and loads the source folder rather than the packed package.
- **Docker (`homebridge/homebridge` image).** HomeKit pairing needs mDNS on the LAN, which needs host networking; Docker Desktop on macOS doesn't support it well.
- **Running `homebridge` directly and restarting it in a loop.** Works for HomeKit but gives no web UI with Config UI X 5, see above.

No dependency is added to the plugin: Homebridge and Config UI X are installed only into `.homebridge-local/`.

## Files

- `scripts/local-homebridge.sh`: the script (`start`, `reset`, `clean`, `help`).
- `package.json`: `homebridge:local` script.
- `.gitignore`, `.npmignore`: ignore `.homebridge-local/`; don't publish `scripts/`.
- `README.md`: "Testing locally with your iPhone", a step-by-step guide (later moved to `docs/guides/testing-locally.md`, see [Split the README into guides](2026-11-26-split-readme-into-guides.md)): what you need, getting the code, starting, configuring in the web UI, pairing with the Home app, testing a change, cleaning up and troubleshooting.
- `AGENTS.md`: the real-device check points to the script.

## Docs updated

`README.md`, `AGENTS.md`, `docs/README.md` and this note. `config.schema.json` is unchanged: no settings changed.

## Verified / not verified

- ✅ In a Linux container (Node 22.23, as root): a first run with `DAIKIN_HOST` set builds, packs and installs the plugin, Homebridge 2.4.0 and Config UI X 5.30.1, writes `config.json` (mode 600), and starts Homebridge with the packed plugin (`Loaded plugin: @dylannlaw/homebridge-daikin-air-purifier@0.2.0`), which publishes the test bridge on port 51827.
- ✅ The web UI answers on port 8581; creating the first user, logging in and reading the plugin's settings schema through its API work; a restart through the API restarts Homebridge.
- ✅ `reset` removes the pairing and changes the bridge ID; `clean` deletes the folder; `help` prints the usage; `npm pack --dry-run` doesn't include `scripts/` or `.homebridge-local/`.
- ✅ `npm run lint && npm test` passes.
- ❌ Not run on macOS, and not paired with a real iPhone: the container has no LAN or mDNS. The bridge advertised itself, but pairing from the Home app is untested.
- ❌ Not tested against a real purifier (the test used an unreachable documentation IP, and the plugin logged the expected connection error).
- ❌ The interactive prompt for the IP and the web UI in a browser weren't exercised (the run had no terminal and used the API).

## Follow-ups

- Try it on macOS with a real iPhone and purifier, and note anything that differs here.
