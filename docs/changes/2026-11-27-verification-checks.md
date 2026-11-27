# Pass the Homebridge verification checks

## Summary

`config.schema.json` lists its required fields at the object level, and `package.json` has a `homepage`. This is version 2.1.1.

## Why

The checks bot on the verification request ([homebridge/plugins#1401](https://github.com/homebridge/plugins/issues/1401)) failed v2.1.0 on two points:

- `homepage` missing or does not start with `https://`.
- The config schema is invalid: `required` must not be a boolean on individual fields.

Every other check passed.

## Design

- `name` and `cacheDuration` had `"required": true`. That is an old JSON Schema form, which the checker compiles with Ajv 8 and rejects ("required must be array"). They are now listed once as `"required": ["name", "cacheDuration"]` on the `schema` object. The same fields stay required, and `cacheDuration` keeps its default of 60, so nothing changes for users.
- `homepage` is the README on GitHub: `https://github.com/dylannlaw/homebridge-daikin-air-purifier#readme`.
- Both files are part of the plugin, so this is a release (2.1.1). The checker reads the published npm version.

## Files

- `config.schema.json`: `required` moved to the object level.
- `package.json`, `package-lock.json`: `homepage`, 2.1.1.
- `CHANGELOG.md`, `docs/README.md`, this note.

## Docs updated

`CHANGELOG.md` and `docs/README.md`. The README's settings don't change.

## Verified / not verified

- ✅ I compiled the schema the way the checker does (`src/plugin-checks/workspace/index.ts` in homebridge/plugins: Ajv 8, `strict: false`). The v2.1.0 schema fails with "name/required must be array, cacheDuration/required must be array", and the new one compiles. The checker's `homepage` test (`startsWith('https://')`) passes.
- ✅ `npm run lint && npm test`.
- ❌ Not checked: the settings form in the Homebridge UI. Object-level `required` is the standard form and the one the checker asks for.

## Follow-ups

After 2.1.1 is on npm, comment `/check` on homebridge/plugins#1401 to run the checks again.
