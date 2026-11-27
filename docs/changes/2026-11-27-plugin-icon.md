# Plugin icon

## Summary

The plugin has an icon. It shows at the top of the README and is ready to attach to the Homebridge verification request.

## Why

The **Verified By Homebridge** request can include an icon for the Homebridge UI. It must be a square PNG of about 100 × 100 px that doesn't break any trademark.

## Design

- A white air purifier on a blue rounded tile, with two wind lines for clean air and a water drop for the humidifier. It is drawn in plain shapes, so it stays readable at 100 px.
- Daikin's logo, name and colours aren't used, to avoid any trademark problem. The product isn't copied either: the purifier is generic.
- `docs/assets/icon.svg` is the source. The PNGs are rendered from it with headless Chrome at 512 px (`icon.png`) and 100 px (`icon-100.png`), both with transparent corners.
- The README links the PNG by its full `raw.githubusercontent.com` URL on `master`, because `docs/` isn't published to npm and relative links break there. The image appears once this change is on `master`.

## Files

- `docs/assets/icon.svg`, `docs/assets/icon.png`, `docs/assets/icon-100.png`: new.
- `README.md`: the icon above the title.
- `docs/README.md`: this note and the icon in the index.

## Docs updated

`README.md` and `docs/README.md`.

## Verified / not verified

- ✅ Rendered at 512 px and 100 px and checked by eye. Both are square PNGs with an alpha channel.
- ❌ Not checked: how the Homebridge UI crops it on the plugin tile. That depends on the Homebridge team adding it after verification.

## Follow-ups

Attach `docs/assets/icon-100.png` to the verification request.
