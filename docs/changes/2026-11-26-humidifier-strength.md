# Set the humidifier's strength from HomeKit

## Summary

The humidifier tile has a strength slider (`RotationSpeed`) that sets Low, Standard or High. Turning the humidifier on now also turns the purifier on. The setter that never worked, on the read-only `WaterLevel`, is removed.

## Why

Strength couldn't be set from HomeKit. The code put the setter on `WaterLevel`, which is read-only in HomeKit, so the Home app showed no control and the setter never ran. Plan: [humidifier-strength](../plans/humidifier-strength.md).

## Design

- **Slider:**

  | Slider | `humd` sent | Shows after reading back |
  |---|---|---|
  | 0% | `0` (off) | 0% |
  | 1–33% | `1` (Low) | 33% |
  | 34–66% | `2` (Standard) | 66% |
  | 67–100% | `3` (High) | 100% |
  | (read only) | `4` (VeryHigh, which Smart mode uses) | 100% |

  `4` isn't offered as a setting, because its meaning is unconfirmed.
- **Sending a change:** each one sends the full `pow`, `mode`, `airvol` and `humd` set as one `set_control_info` call. A strength above 0% also turns the purifier on; 0% leaves the power as it is.
- **`setActive`:** turning humidifying on now sends `pow=1`. Before, it sent the current power, so it did nothing while the purifier was off.
- **Read-only:** without the control settings, the slider is read-only through `bindSet`.
- **Rejected:** a target humidity (`RelativeHumidityHumidifierThreshold`), because Daikin uses levels, not a target. Three switches, because there would be too many tiles. A three-step slider, because the Home app would show 1%, 2% and 3%. Details are in the plan.

No new settings or dependencies.

## Files

- `src/Service/Humidifier.ts`: `RotationSpeed` getter and setter, the `setActive` power fix, and `WaterLevel` without a setter.
- `test/services.test.mjs`: tests for each slider band, 0%, the read-back values, power on, the `WaterLevel` getter only, the set handler wiring, and read-only mode.

## Docs updated

- `README.md`: the humidifier card and "Using it in the Home app".
- `docs/plans/humidifier-strength.md`, `docs/README.md`.

## Verified / not verified

- ✅ `npm run lint && npm test`: 231 tests pass.
- ❌ **Home app:** not checked where the slider appears (`npm run homebridge:local`).
- ❌ **Real purifier:** not checked that Low, Standard and High are `humd` `1`, `2` and `3`, or what `4` means. Control also needs a working `clientSecret` and `terminalId`, which can't currently be captured (see the README's Limitations).

## Follow-ups

- Find out what `humd=4` is. Set each strength in the Daikin app and read `humd` from `/cleaner/get_unit_info`.
- `WaterLevel` shows `water_supply` as a number (`1` shows as 1%). That's probably a tank flag rather than a percentage, and worth checking on a device.
