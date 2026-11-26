# Docs

How and why this project is built the way it is. Read this before changing anything; see [`../AGENTS.md`](../AGENTS.md) for the rules and [`WORKFLOW.md`](WORKFLOW.md) for the flow.

## Plans

Living files, written before a larger change is built.

- (none yet)

## Change notes

One per non-trivial change, newest first.

- [2026-11-26 OpenAPI reference, conformance tests and Codecov coverage](changes/2026-11-26-openapi-conformance-and-coverage.md)
- [2026-11-26 Adopt the docs-first workflow](changes/2026-11-26-adopt-docs-first-workflow.md)

## Research

- [2026-11-26 How the plugin compares with the Daikin Smart API reference](research/2026-11-26-openapi-conformance.md)

## Reference

- [Daikin Smart API (unofficial OpenAPI 3 spec)](reference/daikin-smart-api.openapi.yaml): reverse-engineered from Daikin Smart App traffic captured in November 2026. Not affiliated with Daikin. `test/openapi.test.mjs` checks the client against it.
