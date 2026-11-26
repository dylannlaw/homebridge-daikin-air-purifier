# Security policy

## Reporting a problem

Please **don't open a public issue** for a security problem. Report it privately instead:
[open a security advisory](https://github.com/dylannlaw/homebridge-daikin-air-purifier/security/advisories/new) on GitHub.

Include what you found, how to reproduce it and which version you used. You'll get a reply as soon as
the maintainer can, and a fix will be released before the details are made public.

## What's in scope

- `src/client.ts`: handles the Daikin email and password, OAuth tokens and cloud API calls.
- `src/index.ts` and `config.schema.json`: read and validate the user's settings, including secrets.
- `.github/workflows/`: publishes to npm.

## Supported versions

Only the newest release (or the latest `master`) gets fixes.
