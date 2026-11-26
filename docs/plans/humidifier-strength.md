# Plan: set the humidifier's strength (Low, Standard, High)

Status: approved and implemented ([change note](../changes/2026-11-26-humidifier-strength.md)). Built as planned.

## Goal

Users can set how strongly the purifier humidifies (Low, Standard or High) from the Home app, Siri and scenes. Today the humidifier tile can only turn humidifying on (always at Standard) or off.

## Options considered

| Option | Why / why not |
|---|---|
| `RotationSpeed` on the humidifier, in three bands (picked) | A standard optional characteristic of HomeKit's HumidifierDehumidifier service, shown as a slider. It works with Siri ("set the humidifier to 100%") and in scenes, and it matches how the fan speed slider already works. |
| Keep the setter on `WaterLevel` (today's code) | Doesn't work. `WaterLevel` is read-only in HomeKit, so the Home app never shows a control and `setWaterLevel` never runs. It also sent only `humd` and dropped `pow`, `mode` and `airvol`. Removed. |
| `RelativeHumidityHumidifierThreshold` (target humidity %) | Daikin takes fixed strength levels, not a target humidity, so the number shown would mean nothing. |
| Three switches, like the mode switches | Possible, but it adds three more tiles for something a slider already does. Rejected for now. |
| Restrict the slider to three steps (for example `maxValue 3`) | The Home app still shows it as a percentage, so 1, 2 and 3 would read as 1%, 2% and 3%. Rejected. |

## Design

### The slider

The humidifier service gets `RotationSpeed`, set with `client.bindSet()` so it's read-only without the control settings.

| Slider | `humd` sent | Slider shows after reading back |
|---|---|---|
| 0% | `0` (off) | 0% |
| 1–33% | `1` (Low) | 33% |
| 34–66% | `2` (Standard) | 66% |
| 67–100% | `3` (High) | 100% |
| (read only) | `4` (VeryHigh, used by Smart mode) | 100% |

`4` isn't offered as a setting. The plugin only sends it with Smart mode (HomeKit's Auto), and whether it's a fourth strength or Daikin's "auto humidity" isn't known.

### Sending a change

Every change sends the full `pow`, `mode`, `airvol` and `humd` set, as one `set_control_info` call, like the other controls:

- **Strength above 0%:** `pow=1`, the current `mode` and `airvol`, and the new `humd`.
- **0%:** the current `pow`, `mode` and `airvol`, with `humd=0`.

### Fixes in the same change

- **`setActive`:** it sent the current `pow`, so turning the humidifier on while the purifier was off left it off. Turning it on now sends `pow=1`.
- **`WaterLevel`:** keeps its getter but no longer has a setter.

### API calls and security

Changes made within 1 second are already merged into one request, so dragging the slider costs one call. There are no new settings and no new secrets.

## Files expected to change

- `src/Service/Humidifier.ts`
- `test/services.test.mjs`
- `README.md`: the humidifier card and "Using it in the Home app"
- `docs/changes/2026-11-26-humidifier-strength.md` and `docs/README.md`

## Verification

- `npm run lint && npm test`. Tests:
  - Each slider band sends the right `humd`, with power on and `mode` and `airvol` kept.
  - 0% turns humidifying off without changing power.
  - The slider reads back 0, 33, 66 or 100.
  - Turning the humidifier on also turns the power on.
  - `WaterLevel` has no setter.
  - The slider is read-only in local mode.
- **Real device:** check in the Home app (`npm run homebridge:local`) where it shows the slider (the main tile or the detail page). Also check, on a purifier with working control, that Low, Standard and High are `1`, `2` and `3`.

## Open questions

- Is `humd=4` a fourth strength, or "auto humidity"? To find out, set each strength in the Daikin app and read `humd` from `http://<purifier IP>/cleaner/get_unit_info`.
