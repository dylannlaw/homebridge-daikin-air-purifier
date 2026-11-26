# Read status from the local IP first, with the cloud as fallback

## Summary

When `host` is set, status is read from the purifier's local IP first, and the Daikin cloud is only the fallback (at most once a minute). Without `host`, status still comes from the cloud. Control is unchanged and always goes through the cloud. The README now recommends setting `host` in cloud mode.

## Why

On 2026-11-26 production Homebridge logged `Unable to read status from the Daikin cloud: timeout of 10000ms exceeded` and `set_control_info` timeouts, while at the same time:

- `http://<purifier IP>/cleaner/get_unit_info` answered `ret=OK` in about 0.3 s
- the Daikin API answered a request that wasn't logged in within about 0.1 s

The cloud relays each device call to the purifier, which checks in with the cloud from time to time (`method=polling`), so a cloud read can take seconds or time out even when nothing is broken. The user asked for the local IP to be used whenever it's set, to stop the slowness.

This reverses the decision in [Follow the OpenAPI reference](2026-11-26-openapi-conformance-and-coverage.md), which rejected local-first polling because the cloud was wanted as the source. The new reason is the cloud's speed and timeouts in real use. Plan: [local-status-first](../plans/local-status-first.md).

## Design

- `fetchUnitInfo()`: with `host`, read locally; on failure, with a Daikin login set, read the cloud for that refresh. Without `host`, read the cloud.
- The cloud fallback runs at most once per 60 s (`cloudFallbackAt`), so a local outage with a 15 s `cacheDuration` can't poll the cloud every 15 s.
- Local failures are logged once per outage: a warning naming the cloud fallback, or an error when there's no login. An info line says when the local IP answers again. Repeats go to debug. Before, every failed local read logged an error.
- The `cacheDuration` minimum depends on where status comes from: 15 s with `host`, 60 s for the cloud only.
- The startup read-only message names the purifier when `host` is set.
- Considered: a setting to pick the source. Not done, since setting `host` already says the purifier is reachable locally.
- The cloud→local fallback for a cloud-first setup is gone, because with `host` set the cloud is no longer first.

## Files

- `src/client.ts`: local-first `fetchUnitInfo()`, the limited cloud fallback, once-per-outage local logging, the `cacheDuration` minimum by source, and the read-only message.
- `test/client.status.test.mjs`: tests for local first, cloud only without `host`, the cloud fallback and its once-a-minute limit, logging, and the minimums.
- `test/client.control.test.mjs`, `test/plugin.test.mjs`: expectations moved to the local read, and the cloud polling test runs without `host`.

## Docs updated

`README.md` (feature tile, setup step recommending `host`, settings table, limitations, rate limits, guide link), `docs/guides/how-it-works.md` (how status is read, API calls kept low), `config.schema.json` (`host` and `cacheDuration` descriptions), `CHANGELOG.md` (1.1.0), `docs/README.md`, the superseded-in-part note on the OpenAPI change note.

## Verified / not verified

- ✅ `npm run lint && npm test`: all 244 tests pass.
- ✅ The real purifier answers `get_unit_info` locally in about 0.3 s (checked by hand, before the change).
- ❌ Not yet run in Homebridge against the real purifier. Check the log shows no cloud status reads with `host` set, and that the fallback warning appears when the purifier is unplugged.

## Follow-ups

- The `set_control_info` handler still waits for the cloud before HomeKit gets its answer. Answering HomeKit straight away and confirming from the next status read would make taps feel instant.
