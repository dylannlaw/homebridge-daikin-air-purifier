# Docs

How and why this project is built the way it is. Read this before changing anything; see [`../AGENTS.md`](../AGENTS.md) for the rules and [`WORKFLOW.md`](WORKFLOW.md) for the flow.

## Guides

For users, linked from the main README.

- [How it works](guides/how-it-works.md): cloud status with the local IP as fallback, how control works end to end, login and tokens, how API calls are kept low, advanced settings, API reference.
- [Testing locally with your iPhone](guides/testing-locally.md): run the plugin in a private test Homebridge and pair it with the Home app.

## Plans

Living files, written before a larger change is built.

- [Make the cloud API calls follow the OpenAPI reference](plans/align-api-with-openapi.md) (implemented)

## Change notes

One per non-trivial change, newest first.

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
