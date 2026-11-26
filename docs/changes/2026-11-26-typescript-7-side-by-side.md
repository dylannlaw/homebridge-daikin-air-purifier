# TypeScript 7 for the build, TypeScript 6 API for ESLint

## Summary

The build compiles with TypeScript 7.0.2. `typescript-eslint` keeps using the TypeScript 6 API through the `@typescript/typescript6` package.

## Why

Dependabot PR #9 bumped `typescript` to 7.0.2. CI failed at `npm ci`: even the latest `typescript-eslint` (8.74.0) declares `typescript <6.1.0` and refuses to run on TS 7 (upstream tracking issue typescript-eslint#10940).

## Design

- `typescript` is aliased to `npm:@typescript/typescript6` so `typescript-eslint` finds a compatible API and its peer range is satisfied.
- `typescript7` is an alias of `typescript@^7.0.2`. `build` runs `node ./node_modules/typescript7/bin/tsc` because both packages provide a `tsc` bin.
- This is the side-by-side setup in Microsoft's TS 7 announcement. Not picked: `--legacy-peer-deps` (hides the error, lint still crashes) or staying on TS 6 (kept as the fallback).

## Files

- `package.json`, `package-lock.json`: the aliases and the build script.

## Docs updated

None needed; users see no change.

## Verified / not verified

- ✅ Clean `npm ci`, `npm run lint` and `npm test` (build with tsc 7.0.2) pass locally: 128 tests.
- ❌ CI on Node 22/24/26 not yet seen. No real purifier needed or used.

## Follow-ups

Once `typescript-eslint` supports TS 7, drop the aliases and use plain `typescript@^7`.
