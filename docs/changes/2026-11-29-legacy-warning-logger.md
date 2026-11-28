# Log the old-config warning through the Homebridge logger

## Summary

The warning about the pre-2.1.0 config format uses `log.warn` when Homebridge creates the platform, and `console.warn` (was `console.error`) when it can't. Version 2.1.4.

## Why

A Homebridge reviewer [noted after verifying the plugin](https://github.com/homebridge/plugins/issues/1401#issuecomment-7239822671) that the warning is written with `console.error`, apart from the plugin's other lines, and suggested `log.warn`.

## Design

- Homebridge (checked in 2.4.0) gives a logger only to a platform or accessory constructor. The initializer's `api` has none, and `homebridge` exports `Logger` only as a type.
- With a `platforms` block (the leftover-block case), the platform constructor passes `log.warn` to `warnAboutLegacyConfig`. Homebridge adds the prefix.
- With only the old `accessories` block, the platform is never created, so no logger exists. The initializer writes to `console.warn` with the `[DaikinAirPurifier]` prefix. It skips this when a platform block exists, so the message isn't logged twice.
- **Not** done: registering a stub accessory to get a logger (rejected in the [dynamic platform plan](../plans/dynamic-platform.md), and nothing here changes that reason); importing Homebridge's logger from an internal path (not exported, and `homebridge` isn't a runtime dependency).

## Files

- `src/legacyConfig.ts`: takes an optional `warn`; the console fallback only without a platform block; the prefix moved to the fallback.
- `src/index.ts`: the platform constructor calls it with `log.warn`.
- `test/legacyConfig.test.mjs`: covers each startup case.
- `README.md`, `CHANGELOG.md`, `docs/README.md`, this note and the 2026-11-27 note; `package.json`, `package-lock.json`: 2.1.4.

## Docs updated

`README.md` (upgrade note), `CHANGELOG.md`, `docs/README.md`.

## Verified / not verified

- ✅ `npm test`: 269 tests pass.
- ✅ `eslint . --max-warnings=0 --ignore-pattern '.claude/**'` passes. Plain `npm run lint` fails on this machine only because local git worktrees under `.claude/worktrees/` are linted too.
- ✅ Real Homebridge 2.4.0, scratch storage, fake IP 192.0.2.1: with only the old block, the `[DaikinAirPurifier]` console warning appears once, before Homebridge's `No plugin was found` line; with both blocks, it appears once, with the platform's log prefix, also before that line.
- ❌ Not checked: a child bridge, and a real purifier (control and status are unchanged).

## Follow-ups

None.
