# Plan: read status from the local IP first

Status: approved and implemented ([change note](../changes/2026-11-26-local-status-first.md))

## Goal

When the user sets the purifier's local IP (`host`), status is read from the purifier over the local network, which answers in well under a second. The Daikin cloud is only used to read status when the local read fails, and for control, which has no local path on current firmware. The README tells users to set `host` for faster, more reliable status.

## Options considered

| Option | Why / why not |
|---|---|
| A (picked): local first when `host` is set, cloud as the fallback | The local read takes about 0.3 s. A cloud read goes through the Daikin cloud, which waits for the purifier to check in, and was seen timing out after 10 s (2026-11-26) while the purifier answered locally. It also cuts the cloud requests on the user's account from one per refresh to none. |
| B: keep cloud first, local fallback (the earlier decision) | Rejected now. It was picked in [Follow the OpenAPI reference](../changes/2026-11-26-openapi-conformance-and-coverage.md) because the request then was for the cloud to be the source. The new reason: in use, the cloud read is slow and times out, and every timeout costs 10 s before the fallback. |
| C: a setting to choose the source | Not needed: setting `host` already says the purifier is reachable locally. One fewer option to explain. |

## Design

- `fetchUnitInfo()`: with `host` set, read locally first; if that fails and the cloud is configured, read the cloud for that refresh. Without `host`, read the cloud as before.
- The cloud fallback is limited to one attempt per 60 s (the cloud minimum), so a local outage with a 15 s `cacheDuration` can't poll the cloud every 15 s.
- Logging: a local failure is logged once per outage (error when there's no cloud fallback, warning when there is, naming the fallback), and an info line when the local IP answers again. Repeats go to debug.
- `cacheDuration` minimum: 15 s when `host` is set (status is local), 60 s when status comes only from the cloud.
- Startup's read-only message names the local IP when `host` is set.
- Control is unchanged: `set_control_info` still goes through the cloud.
- No new setting, no new dependency. No secret is logged.

## Files expected to change

- `src/client.ts`
- `test/client.status.test.mjs`, `test/client.local.test.mjs`
- `README.md`, `docs/guides/how-it-works.md`, `config.schema.json` (the `host` description)
- `CHANGELOG.md`, `package.json`, `package-lock.json` (1.0.7)
- `docs/changes/2026-11-26-local-status-first.md`, `docs/README.md`, the superseded note

## Verification

`npm run lint && npm test`, with tests for: local first with no cloud request, cloud fallback when local fails, fallback limited to once per 60 s, logged once per outage, cloud only without `host`, cache minimums. Against the real purifier: run with `host` set and check the log shows local reads and no cloud reads.

## Open questions

None.
