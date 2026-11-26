# Plan: set the humidifier's strength (Low, Standard, High)

Status: approved and implemented ([change note](../changes/2026-11-26-humidifier-strength.md)). Built as planned.

## Goal

Users can set how strongly the purifier humidifies (Low, Standard or High) from the Home app, Siri and scenes. Today the humidifier tile can only turn humidifying on (always at Standard) or off.

## Options considered

| Option | Why / why not |
|---|---|
| `RelativeHumidityHumidifierThreshold` ("Humidify to") in three steps, 40, 50 and 60% (picked, see the addition below) | The only humidifier slider the Home app shows, on the main tile. Daikin takes a strength, not a target, so the percentages are labels for the three steps. |
| `RotationSpeed` on the humidifier, in three bands (built first, kept) | A standard optional characteristic of the HumidifierDehumidifier service. It works in Eve and with Siri percentages, but **the Home app doesn't show it on a humidifier**, which was found when testing on an iPhone. |
| Keep the setter on `WaterLevel` (today's code) | Doesn't work. `WaterLevel` is read-only in HomeKit, so the Home app never shows a control and `setWaterLevel` never runs. It also sent only `humd` and dropped `pow`, `mode` and `airvol`. Removed. |
| Three switches, like the mode switches | Clear labels, but three more tiles. Rejected in favour of the target humidity slider. |
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

### Addition: the target humidity slider

Found when testing on an iPhone: the bridge advertises `RotationSpeed` on the humidifier, but the Home app doesn't draw it. The Home app's humidifier tile shows power, Auto/Humidifier and a "Humidify to" slider (`RelativeHumidityHumidifierThreshold`). So strength is also set with that slider. This reverses the earlier rejection of the target humidity option, for this reason.

| "Humidify to" | `humd` sent | Shows after reading back |
|---|---|---|
| 40% (below 45) | `1` (Low) | 40% |
| 50% (45 to 54) | `2` (Standard) | 50% |
| 60% (55 or more) | `3` (High) | 60% |
| (read only) | `4` (VeryHigh) | 60% |
| (read only) | `0` (off) | 50%, the strength that turning on sets |

- The slider is limited to 40–60% in steps of 10, so it has exactly three positions.
- The percentages are labels, not a measured target. Whether they're close to the humidity Daikin aims for at each strength hasn't been checked against the manual.
- Humidifying is turned off with the tile's power button, as the slider has no off position.
- `RotationSpeed` stays for Eve and Siri, and both sliders send a strength the same way.

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
