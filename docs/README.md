# Docs

How and why this project is built the way it is. Read this before changing anything; see [`../AGENTS.md`](../AGENTS.md) for the rules and [`WORKFLOW.md`](WORKFLOW.md) for the flow.

## Guides

For users, linked from the main README.

- [How it works](guides/how-it-works.md): status from the local IP first with the cloud as fallback, how control works end to end, login and tokens, how API calls are kept low, advanced settings, API reference.
- [Capturing credentials with mitmproxy](guides/capturing-credentials.md): read `clientSecret` and `terminalId` from the Daikin Smart App's traffic (WireGuard mode; not yet confirmed to work with the current app).
- [Testing locally with your iPhone](guides/testing-locally.md): run the plugin in a private test Homebridge and pair it with the Home app.

## Plans

Living files, written before a larger change is built.

- [Read status from the local IP first](plans/local-status-first.md) (implemented)
- [Switches for the purifier's Eco, Pollen and Circulator modes](plans/mode-switches.md) (implemented)
- [Make the cloud API calls follow the OpenAPI reference](plans/align-api-with-openapi.md) (implemented)

## Change notes

One per non-trivial change, newest first.

- [2026-11-27 Rebuild on save in the local Homebridge, and remove nodemon](changes/2026-11-27-homebridge-local-watch.md)
- [2026-11-27 Wait before taking new dependency releases](changes/2026-11-27-dependency-cooldown.md)
- [2026-11-27 Require Homebridge 2.0 and test 2.0 to 2.4 and latest](changes/2026-11-27-require-homebridge-2.md)
- [2026-11-27 Add a contributing guide](changes/2026-11-27-contributing-guide.md)
- [2026-11-26 Read status from the local IP first, with the cloud as fallback](changes/2026-11-26-local-status-first.md)
- [2026-11-26 Answer HomeKit reads from the cache, never waiting on the network](changes/2026-11-26-fast-homekit-reads.md)
- [2026-11-26 Keep the version in package.json and CHANGELOG.md in step with npm](changes/2026-11-26-version-in-repo.md)
- [2026-11-26 Start the 1.0 release line](changes/2026-11-26-version-1-0.md)
- [2026-11-26 Switches for the purifier's Eco, Pollen and Circulator modes](changes/2026-11-26-mode-switches.md)
- [2026-11-26 Redesign the README as a step-by-step guide](changes/2026-11-26-readme-redesign.md)
- [2026-11-26 Describe the settings as cloud mode and local mode](changes/2026-11-26-cloud-and-local-modes.md)
- [2026-11-26 Guide to capturing credentials with mitmproxy](changes/2026-11-26-mitmproxy-capture-guide.md)
- [2026-11-26 Follow the OpenAPI reference for API calls, and read status from the cloud](changes/2026-11-26-openapi-conformance-and-coverage.md)
- [2026-11-26 Split the README into short overview and guides](changes/2026-11-26-split-readme-into-guides.md)
- [2026-11-26 Script to test the plugin in a local Homebridge](changes/2026-11-26-local-homebridge-script.md)
- [2026-11-26 Upload test coverage to Codecov](changes/2026-11-26-codecov-coverage.md)
- [2026-11-26 Release to npm on every commit to master](changes/2026-11-26-release-on-every-commit.md)
- [2026-11-26 Adopt the docs-first workflow](changes/2026-11-26-adopt-docs-first-workflow.md)

## Research

- [2026-11-26 How the plugin's API calls follow the Daikin Smart API reference](research/2026-11-26-openapi-conformance.md)

## Reference

- [Daikin Smart API (unofficial OpenAPI 3 spec)](reference/daikin-smart-api.openapi.yaml): reverse-engineered from Daikin Smart App traffic captured in November 2026. Not affiliated with Daikin. The client's calls follow it; see the research note above.
