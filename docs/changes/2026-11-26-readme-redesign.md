# Redesign the README as a step-by-step guide

## Summary

The README now follows the layout of the MacAwake README: a centred header with an install link, a table of contents, a grid of features, then step-by-step sections for what you need, installing, configuring, using it in the Home app, limitations, and links to the other documentation.

## Why

The old README started with a feature table and the details of each mode, which made it hard for a new user to see what the plugin does and what to do first. The request was to guide users step by step, in the style of the MacAwake README.

## Design

- **Before you start** lists what's needed and lets the user pick cloud mode or local mode before installing, with an early warning that control may not work on the current app.
- **Get started** is five numbered steps, ending with what the log says when control is off.
- **Limitations** brings together the points that were spread across the old README: control on newer app versions, no local control on newer firmware, cloud status not yet confirmed end to end. It adds one new point: only the MCK70W on firmware 3.17.0-g4 has been tested (the firmware the maintainer runs it on), which is also stated in the header and in Before you start.
- **Finding the IP address:** Get started now tells users to read the purifier's local IP from the **Model information** section of the Daikin Smart App, the same place that shows the firmware version, before reserving it in the router.
- **Good to know** keeps the rate-limit guidance, and adds a short note on where credentials are kept and where status comes from.
- All links into `docs/` stay as full GitHub URLs, because `docs/` isn't published to npm.
- There are no screenshots, because the repo has none yet.

The mode switches feature (on the `feat/mode-switches` branch) isn't on master yet, so this README leaves it out. That branch adds its own section when it merges.

## Files

- `README.md`: rewritten.
- `docs/README.md`: index line for this note.

## Docs updated

`README.md`. The guides didn't change.

## Verified / not verified

- ✅ `npm run lint && npm test` pass.
- ✅ Every in-page link (`#...`) matches a heading. The claims about the humidifier tile and secrets not being logged were checked against `src/`.
- ✅ The maintainer confirmed the plugin works on an MCK70W with firmware 3.17.0-g4, and that the IP address and firmware are shown under Model information in the Daikin Smart App.
- ❌ Not checked how it renders on npmjs.com, only on GitHub-style Markdown.

## Follow-ups

Add Home app screenshots to the feature grid.
