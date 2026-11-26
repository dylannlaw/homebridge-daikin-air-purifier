# Switches for the purifier's Eco, Pollen and Circulator modes

## Summary

The purifier now has one HomeKit switch each for Daikin's Eco, Pollen and Circulator modes. They're linked to the Air Purifier service and work as a single choice. A new optional setting, `modeSwitches`, chooses which switches appear.

## Why

HomeKit's Air Purifier service only has Auto and Manual, so these modes could only be chosen in the Daikin Smart App. The Home app has no dropdown for an air purifier. See the [plan](../plans/mode-switches.md) for the options considered: a Television "input" picker, custom characteristics, and slider positions.

## Design

- **Services:** `src/Service/ModeSwitch.ts` creates one `Switch` per enabled mode, with subtypes `mode-eco`, `mode-pollen` and `mode-circulator`, and `ConfiguredName` set so the Home app shows the name. The switches are linked to the Air Purifier service with `addLinkedService`.
- **Reading state:** a switch reads on when `pow=1` and `mode` is its mode. It uses the cached status, so the switches add no requests to polling.
- **Turning a mode on:** sends `pow=1`, the mode, `airvol=0` and the current `humd` as one `set_control_info` call, then shows the other switches as off without calling the API.
- **Turning off the current mode's switch:** sends Smart mode (HomeKit's Auto) with `airvol=0`. Turning off any other switch sends nothing.
- **Read-only:** without the control settings, `bindSet` makes the switches read-only, like every other control.
- **`modeSwitches`:** a list of `eco`, `pollen` and `circulator`. When it's missing, all three are shown, and `[]` shows none. Unknown names are ignored. A value that isn't a list logs a warning and shows all three.

These follow the plan's picks: all three are on by default, turning off the current mode goes back to Auto, and `airvol=0` is sent in these modes.

No new dependencies.

## Files

- `src/Service/ModeSwitch.ts`: new. The switches and `enabledModes()`.
- `src/index.ts`: creates the switches, adds their services, and refreshes them on each poll.
- `src/types.d.ts`: `ModeSwitchName`.
- `config.schema.json`: `modeSwitches`, as checkboxes under Cache Duration.
- `test/services.test.mjs`, `test/plugin.test.mjs`: tests for reading state, one change per mode switch, going back to Auto, no call for switches that aren't the current mode, the setting, linking, read-only mode, and the service list.

## Docs updated

- `README.md` (the redesigned one): an "Eco, Pollen and Circulator modes" card in "What it can do", the `modeSwitches` row in "All settings", and a "Mode switches" section under "Using it in the Home app".
- `docs/guides/how-it-works.md`: what the switches send in `set_control_info`, and that the mode numbers are unconfirmed.
- `docs/plans/mode-switches.md`: marked approved and implemented.

## Verified / not verified

- ✅ `npm run lint && npm test`: 236 tests pass, including 11 new or changed ones for the mode switches.
- ❌ **Mode numbers:** not checked on a purifier. Eco 2, Pollen 3 and Circulator 5 come from the original `src/constant.ts`, and the OpenAPI reference says `mode` values aren't mapped yet. To check, set each mode in the Daikin Smart App and read `mode` from `http://<purifier IP>/cleaner/get_unit_info`.
- ❌ **Real device:** not checked in the Home app (`npm run homebridge:local`). That includes where the linked switches appear, Siri names, and whether the Daikin cloud accepts `airvol=0` in these modes. Control also needs a working `clientSecret` and `terminalId`, which can't currently be captured (see the README's Limitations).

## Follow-ups

- Confirm the mode numbers and `airvol` with a capture of the Daikin app's `set_control_info` call.
- Add a setter for `TargetAirPurifierState`, so Auto/Manual can be changed from HomeKit.
- Add humidifier strength through `RotationSpeed`, in place of the read-only `WaterLevel` setter (separate plan).
