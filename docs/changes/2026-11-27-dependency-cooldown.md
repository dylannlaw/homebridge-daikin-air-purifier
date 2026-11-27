# Wait before taking new dependency releases

## Summary

npm only resolves releases at least 3 days old (`.npmrc`), and Dependabot waits 7 days before proposing a version update (`.github/dependabot.yml`).

## Why

A compromised or broken release is often found within days. We compared npm with pnpm and Yarn: pnpm delays new releases by default, but moving would mean reworking CI, releasing, the local test script and the docs, for a package with one runtime dependency. npm can be told to wait instead.

## Design

- `min-release-age=3` applies when npm resolves versions, such as `npm install <package>` or `npm update`. `npm ci` installs what the lockfile says.
- Dependabot already waits 3 days by default ([options reference](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference)). We raise it to 7 for both npm and GitHub Actions. It is longer than npm's 3, so a proposed version update is always old enough for npm.
- Cooldown doesn't delay Dependabot security updates.
- For an urgent fix: `npm install <package>@<version> --min-release-age=0`.
- Not picked: switching to pnpm or Yarn (above), and blocking install scripts (the one locked package with one, `fsevents`, is a macOS-only development dependency).

Users are not affected: neither file is published, and their npm resolves dependencies with their own settings. No version bump.

## Files

- `.npmrc`: new, sets `min-release-age`.
- `.github/dependabot.yml`: `cooldown` for both ecosystems.

## Docs updated

This note and the index. The README and guides describe nothing that changed; the settings are explained by comments in the two files.

## Verified / not verified

- ✅ npm 11.20.0: with the setting, a fresh install of `@types/node@26` resolved 26.6.6; with `--min-release-age=0` it resolved 26.6.11, released the day before.
- ✅ npm 11.10.0 honours the setting; 11.9.0 ignores it.
- ✅ `npm ci` and `npm install --package-lock-only` succeed with npm 11.20.0 and 10.9.11, leaving the lockfile unchanged.
- ✅ `npm run lint` and `npm test` (244 tests) pass; the packed plugin includes neither file.
- ❌ Dependabot's behaviour with the new settings: it only runs on GitHub, after merge.
- ❌ Whether `min-release-age` stops Dependabot from preparing a security update to a release less than 3 days old.

## Follow-ups

If a Dependabot security update fails on a very new release, apply it by hand with the override above.
