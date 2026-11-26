# Answer HomeKit reads from the cache, never waiting on the network

## Summary

Every HomeKit read handler (`onGet`) now returns the last known status at once via `Client.getCachedUnitInfo()`, instead of awaiting `getUnitInfo()`. The poll in `src/index.ts` is still what fetches status.

## Why

Homebridge logged "This plugin slows down Homebridge. The read handler for the characteristic '…' was slow to respond!" for every characteristic at once, next to `[GET] https://api.daikinsmartdb.jp/cleaner/set_control_info timeout of 10000ms exceeded`. Read handlers called `await getUnitInfo()`, which fetches when the cache is stale. The cache goes stale right as the poll is due, and a failed change sets it to stale on purpose (`unitInfoFetchedAt = 0`). Any read at that moment waited for the fetch: up to 10 s for the cloud, then 10 s more for the local IP fallback, and possibly a login. HomeKit expects an answer within a few seconds.

## Design

- `getCachedUnitInfo()` is synchronous and returns `this.unitInfo`. If the cache is more than **two** `cacheDuration`s old it starts `getUnitInfo()` in the background (shared with any fetch already running, errors logged at debug).
- Two intervals, not one: the poll fetches every `cacheDuration`, so a one-interval threshold would let a read just before the poll start a second request, which counts against the cloud rate limit. With two, a read only refreshes when the poll is clearly behind or a failed change cleared the cache.
- `getUnitInfo()` keeps its behaviour (await, fetch when stale) for the poll and for tests.
- Considered: making read handlers throw `SERVICE_COMMUNICATION_FAILURE` when the cloud is down ("No Response" in the Home app). Not picked: the last known value is more useful than "No Response", and the log already reports the failures.

## Files

- `src/client.ts`: new `getCachedUnitInfo()`.
- `src/Service/*.ts`: read handlers and the setters that need current state use `getCachedUnitInfo()`.
- `test/client.local.test.mjs`: tests that a read answers while a fetch hangs, joins it rather than starting another, and only refreshes after two intervals.
- `test/services.test.mjs`: the fake client provides `getCachedUnitInfo`.

## Docs updated

`CHANGELOG.md` (1.0.6), `docs/guides/how-it-works.md` (How API calls are kept low). README already says HomeKit reads between refreshes are answered from the last result; no change.

## Verified / not verified

- ✅ `npm run lint && npm test`: 238 tests pass, including the new ones with a hanging purifier mock.
- ❌ Not run against the real purifier and Daikin cloud. Check that the "slow to respond" warnings are gone with `npm run homebridge:local`.

## Follow-ups

- The `set_control_info` timeout itself (cloud slow for control) isn't changed here; the set handler still waits for it, as it should report a failed change.
