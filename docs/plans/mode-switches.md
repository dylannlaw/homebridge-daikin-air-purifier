# Plan: switches for the purifier's Eco, Pollen and Circulator modes

Status: approved and implemented ([change note](../changes/2026-11-26-mode-switches.md)). Built as planned.

## Goal

Users can put the purifier into Daikin's Eco, Pollen or Circulator mode from the Home app, in scenes and automations, and with Siri ("turn on Eco"). They can also see which of those modes it is in. Today HomeKit only offers Auto (Daikin's Smart mode) and Manual (a fan speed from the slider), so these modes can only be chosen in the Daikin Smart App.

## Options considered

| Option | Why / why not |
|---|---|
| One HomeKit Switch per mode, acting as a single choice (picked) | The only standard HomeKit control the Home app shows that fits. Switches work in scenes, automations and Siri. Linked to the Air Purifier service, they appear together on its detail page. |
| A dropdown on the Air Purifier service | Not possible. `TargetAirPurifierState` is fixed to Auto and Manual, and the Home app only draws the controls Apple defines. |
| A Television service whose "inputs" are the modes | The only real picker in the Home app, but it would show as a TV, appear in the Apple TV Remote in Control Center, and have to be a separate accessory paired on its own. Too confusing for an air purifier. |
| Custom characteristics (shown by Eve and similar apps) | The Home app ignores them, so most users wouldn't see anything. |
| Map each mode to a position on the fan slider (for example Eco = 20%) | In these modes the purifier picks its own fan speed, so a slider position can't be sent as a mode without silently changing what the slider means. Rejected. |

## Design

### Services

- New `src/Service/ModeSwitch.ts`, one file for the group, like the other services in `src/Service/`. It creates one `hap.Service.Switch` per enabled mode, with a stable subtype (`mode-eco`, `mode-pollen`, `mode-circulator`) and a name of `Eco`, `Pollen` or `Circulator` (also set as `ConfiguredName`, so the Home app shows that name).
- The switches are added to the Air Purifier service with `addLinkedService`, so the Home app groups them with the purifier.
- `src/index.ts` creates the group, adds its services in `getServices()`, and calls its `identify()` on each refresh, just like the other services.

### Reading state

- A mode's switch is on when `pow` is `1` and `mode` is that mode's value. Every other switch is off.
- This reads the cached `getUnitInfo()` result, so the switches add **no API calls** to status refreshes.

### Changing state

All changes go through `client.setControlInfo()`. It already merges changes made within 1 second into one cloud request, so turning one switch on and the others off costs one call.

| Action | What is sent | Then |
|---|---|---|
| Turn a mode on | `pow=1`, `mode=<that mode>`, `airvol=0`, current `humd` | The other switches are set to off with `updateValue(false)`, which costs no call |
| Turn off the switch for the current mode | `mode=1` (Smart, HomeKit's Auto), `airvol=0`, current `pow` and `humd` | Purifier goes back to Auto |
| Turn off a switch that isn't the current mode | Nothing | No API call |

- `airvol=0` matches what the plugin already sends for Smart mode in `AirPurifier.setActive`. Whether Daikin expects `0` in these modes is an open question below.
- Moving the fan slider while a mode is on already sends `mode=0` (manual fan speed). The next refresh then shows every mode switch as off. That's the intended behaviour and will be documented.
- When the purifier is off, the switches show off. Turning one on also turns the purifier on.

### Read-only and local mode

The switches use `client.bindSet()` like every other control, so without the four control settings they are read-only and only show the current mode.

### Configuration

New optional setting `modeSwitches`: a list of the modes to show, out of `eco`, `pollen` and `circulator`. It defaults to all three, and an empty list shows none.

Per `AGENTS.md`, it goes in `config.schema.json` (a checkbox list), in the config typing in `src/types.d.ts` (or wherever the client reads config), and in the README's settings table, all before it is used.

### Mode values

`src/constant.ts` has `Econo = '2'`, `Pollen = '3'`, `Moist = '4'` and `Circulator = '5'`. These come from the original code, and the OpenAPI reference says the `mode` values are "not yet mapped". `get_model_info`'s example `sup_mode=003F` (bits 0–5) does suggest six modes, which matches the six constants. They must be checked on a real purifier before release (see Verification).

### Out of scope

- **Moist mode** belongs with the humidifier work.
- **The missing setter on `TargetAirPurifierState`**: Auto/Manual can't be changed from HomeKit today. This is a separate fix.
- **Humidifier strength** gets its own plan.

### Security and API calls

No new secrets or login changes. Each mode change is one `set_control_info` call, the same cost as any other change.

## Files expected to change

- `src/Service/ModeSwitch.ts` (new)
- `src/index.ts`
- `src/constant.ts`, if the mode values turn out to be wrong
- `src/types.d.ts`
- `config.schema.json`
- `README.md`: the "What works" table, the "All settings" table, and a short note on how the mode switches and the fan slider interact
- `docs/guides/how-it-works.md`: the "How control works" section
- `test/services.test.mjs`, `test/plugin.test.mjs`
- `docs/changes/YYYY-MM-DD-mode-switches.md` and `docs/README.md`

## Verification

- `npm run lint && npm test`. New tests:
  - Each switch reads on only for its mode with power on.
  - Turning one on sends a single `setControlInfo` with the right `mode`, `pow` and `airvol`, and sets the others off.
  - Turning off the current mode's switch sends Smart mode.
  - Turning off a switch that isn't the current mode sends nothing.
  - `modeSwitches` controls which switches exist, and an empty list gives none.
  - In read-only mode the switches have no write permission.
  - Refreshing makes no extra `getUnitInfo` request.
- **Mode values, on the user's purifier:** set each mode in the Daikin Smart App, then read `mode` from `http://<purifier IP>/cleaner/get_unit_info` on the local network. This needs no cloud call or `terminalId`. Fix `src/constant.ts` if any value differs.
- **Real device:** check with `npm run homebridge:local` and an iPhone that the switches appear on the purifier's detail page, that only one is on at a time, and that the Siri names work. Control can only be confirmed with working `clientSecret` and `terminalId`, which the current app makes hard to capture (see the README's Limitations). If control can't be tested, the change note will say so.

## Open questions

Answered on 2026-11-26 with the picks:

1. **Default:** all three switches are shown by default. Opt-in was the alternative, so existing users wouldn't get three new tiles after an automatic update.
2. **Turning off the current mode:** the purifier goes back to Auto (Smart mode), not to the last manual fan speed.
3. **`airvol` in these modes:** `0`, as for Smart mode. Whether the Daikin app sends `0` or keeps the current speed still needs a capture of its `set_control_info` call.
