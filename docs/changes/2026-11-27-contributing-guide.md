# Add a contributing guide

## Summary

A new `CONTRIBUTING.md` welcomes contributors: ways to help, keeping secrets private, project setup, the pull request steps and the license. The README's contributing link points to it.

## Why

The README linked "Contributing" to `AGENTS.md`, a working agreement that doesn't invite newcomers or explain how to get started.

## Design

`CONTRIBUTING.md` summarises the process and links to `AGENTS.md`, which stays the full set of rules, so there is one source of truth. It lives at the repository root, where GitHub finds it, and is left out of the npm package like `SECURITY.md`.

## Files

- `CONTRIBUTING.md`: new.
- `README.md`: link to it.
- `.npmignore`: leave it out of the published package.

## Docs updated

`README.md` and the `docs/README.md` index.

## Verified / not verified

- ✅ `npm run lint && npm test` passes.
- ✅ Relative links in `CONTRIBUTING.md` point at files that exist.
- ✅ `npm pack --dry-run` doesn't include `CONTRIBUTING.md`.
- ❌ How the page and its GitHub links look on GitHub.

## Follow-ups

None.
