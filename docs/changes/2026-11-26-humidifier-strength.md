# Set the humidifier's strength from HomeKit

## Summary

The humidifier's strength (Low, Standard or High) can be set with the Home app's "Humidify to" slider, in three steps: 40, 50 and 60%. There's also a `RotationSpeed` slider for Eve and Siri, which the Home app doesn't show on a humidifier. Turning the humidifier on now also turns the purifier on. The setter that never worked, on the read-only `WaterLevel`, is removed.

## Why

Strength couldn't be set from HomeKit. The code put the setter on `WaterLevel`, which is read-only in HomeKit, so the Home app showed no control and the setter never ran. Plan: [humidifier-strength](../plans/humidifier-strength.md).

## Design

- **"Humidify to" slider (`RelativeHumidityHumidifierThreshold`):** the only humidifier slider the Home app shows. It's limited to 40–60% in steps of 10: 40% is Low, 50% Standard and 60% High. When reading back, `humd=4` shows 60% and off shows 50%. The percentages are labels for the steps, not a measured target. The first version had only `RotationSpeed`, and testing on an iPhone showed the Home app doesn't draw it on a humidifier.
- **`RotationSpeed` slider (Eve, Siri):**

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
- **Rejected:** three switches, because there would be too many tiles. A three-step `RotationSpeed`, because it would show 1%, 2% and 3%. The target humidity slider was rejected at first and then picked, because the Home app shows no other humidifier slider. Details are in the plan.

No new settings or dependencies.

## Files

- `src/Service/Humidifier.ts`: the `RelativeHumidityHumidifierThreshold` and `RotationSpeed` getters and setters, sharing `setStrength()`, the `setActive` power fix, and `WaterLevel` without a setter.
- `test/services.test.mjs`: tests for the "Humidify to" steps and range, each `RotationSpeed` band, 0%, the read-back values, power on, the `WaterLevel` getter only, the set handler wiring, and read-only mode.

## Docs updated

- `README.md`: the humidifier card and "Using it in the Home app".
- `docs/plans/humidifier-strength.md`, `docs/README.md`.

## Verified / not verified

- ✅ `npm run lint && npm test`: 255 tests pass, with the mode switches merged in.
- ✅ On an iPhone, with `npm run homebridge:local`: the Home app doesn't show `RotationSpeed` on the humidifier, even though the bridge advertises it. That's why the "Humidify to" slider was added.
- ❌ **Home app:** the "Humidify to" slider hasn't been checked on an iPhone yet.
- ❌ **Real purifier:** not checked that Low, Standard and High are `humd` `1`, `2` and `3`, or what `4` means. Control also needs a working `clientSecret` and `terminalId`, which can't currently be captured (see the README's Limitations).

## Follow-ups

- Find out what `humd=4` is. Set each strength in the Daikin app and read `humd` from `/cleaner/get_unit_info`.
- `WaterLevel` shows `water_supply` as a number (`1` shows as 1%). That's probably a tank flag rather than a percentage, and worth checking on a device.
