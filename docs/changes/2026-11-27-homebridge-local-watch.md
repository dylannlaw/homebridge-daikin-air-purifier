# Rebuild on save in the local Homebridge, and remove nodemon

## Summary

`npm run homebridge:local -- watch` starts the private test Homebridge and rebuilds, reinstalls and restarts it whenever a plugin file is saved. The old `npm run watch` (nodemon and `nodemon.json`) is removed, along with its `npm audit` advisories.

## Why

- `npm audit` reported 2 moderate advisories: nodemon depends on `minimatch`, which crafted glob patterns can make very slow ([GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), affects `minimatch` 7.0.0 to 11.0.0). The newest nodemon (3.1.14) still requires `minimatch ^10.2.1`, so upgrading doesn't fix it. It was dev-only and never shipped to users.
- `npm run watch` came with the 2022 template. It used `npm link` into a global Homebridge and `~/.homebridge`, the approach [the local Homebridge script](2026-11-26-local-homebridge-script.md) chose not to use. No guide mentioned it. Its only advantage over `npm run homebridge:local` was rebuilding on save, so that feature moved into the script and there is one way to test.

## Design

`watch` runs the same steps as the default command: build, `npm pack`, install into `.homebridge-local/`, first-run config. Then it loops:

1. Start `hb-service` in the background.
2. Wait for a change. A `node -e` watcher uses `fs.watch` (recursive) on `src/`, plus `config.schema.json` and `package.json`, the files that go into the package. Changes within 500 ms of each other count as one.
3. Stop `hb-service` with `SIGTERM` and wait for it to exit, so the ports are free.
4. Build, pack and reinstall. If that fails, the error stays on screen and Homebridge stays stopped until the next save. The build runs in a subshell with `set -e` turned on again inside it, so `die()` and a failing step end only the build, not the watch.

Two details came out of testing on macOS:

- **Late events.** macOS reported a `package.json` change about 6 seconds after the watcher started, for an edit made a minute earlier, which restarted Homebridge for nothing. The watcher now ignores events for files whose modification time is older than the start of the last build.
- **Saves during a build.** Those files are newer than the start of the build, so the watcher finds them by modification time as soon as it starts.

Ctrl+C stops `hb-service`, Homebridge and the watcher. The whole `hb-service` restarts, web UI included, rather than only the Homebridge child. Finding and restarting only the child would mean picking its process ID out of the supervisor's children, or logging in to the UI's API.

Options not picked:

- **Keeping `npm run watch` with a built-in replacement for nodemon.** It was written and worked, but it kept a second way to test that uses `~/.homebridge`. With no `~/.homebridge/config.json` it started a Homebridge without the plugin.
- **npm `overrides` forcing `minimatch` 11 for nodemon.** It changes `package.json` outside devDependencies and scripts, so `should-release.sh` would publish a release for nothing.
- **Pinning nodemon 3.1.11** (what npm audit suggests). It goes backwards, and Dependabot would keep proposing the vulnerable version.

No dependency is added.

## Files

- `scripts/local-homebridge.sh`: `watch` command. `hb-service` arguments are shared by both modes. `help` prints the header comment up to the first empty line, instead of a fixed line range. Step 4 of the printed instructions mentions watch mode.
- `package.json`, `package-lock.json`: the `watch` script and nodemon are removed (22 packages fewer).
- `nodemon.json`: removed.
- `.npmignore`: the `nodemon.json` entry is removed.

## Docs updated

`docs/guides/testing-locally.md` ("Test a change") and the `docs/README.md` index. The README and `config.schema.json` don't change. No version bump: only devDependencies, scripts and dev tooling changed, so nothing is released.

## Verified / not verified

- ✅ `npm run lint && npm test` passes (244 tests), and `npm audit` reports 0 problems.
- ✅ macOS, `/bin/bash` 3.2.57, in a separate `HB_LOCAL_DIR` with the documentation IP 192.0.2.1 as the purifier:
  - First run: built, packed and installed Homebridge 2.4.0 and Config UI X 5.30.1, wrote the config, and started the bridge and web UI.
  - No restart in 8 seconds without an edit.
  - Saving `src/index.ts` with a marker in a log message: the marker was in Homebridge's log about 2 seconds later.
  - A type error in `src/settings.ts`: the TypeScript error and "The build failed" were shown, and nothing listened on the bridge port. Undoing the error brought Homebridge back.
  - A save made while a build was running was picked up.
  - Ctrl+C (`SIGINT` to the process group): the script exited, no processes were left and both ports were free.
- ✅ The default command (no `watch`) still starts Homebridge and prints the updated step 4.
- ❌ Linux, and pairing with an iPhone while it restarts. HomeKit should reconnect to the same bridge after each restart, but that wasn't tried.

## Follow-ups

None.
