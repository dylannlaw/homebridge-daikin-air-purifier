## What and why

<!-- What does this change, and what problem does it solve? Link the plan in docs/plans/ or the issue. -->

## Checklist

Mirrors [AGENTS.md](../AGENTS.md).

- [ ] I read `docs/README.md` and the notes for what this touches, and this doesn't bring back an idea rejected in a change note (or I explain why).
- [ ] Larger change: there is a plan in `docs/plans/`.
- [ ] `npm run lint && npm test` passes.
- [ ] Plugin change: I raised the version (`npm version patch|minor|major --no-git-tag-version`) and added its `CHANGELOG.md` entry. Merging publishes it.
- [ ] I looked at any UI I changed.
- [ ] `README.md` and the other docs are updated if anything they describe changed.
- [ ] I added a change note in `docs/changes/` and a line for it in `docs/README.md`.
- [ ] Anything that touches login, tokens, `config.schema.json` or the release workflow: I explained how input stays validated and secrets stay out of code.

## What I couldn't check

<!-- Anything not verified: a real device, production data, a deploy preview. -->
