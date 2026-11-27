# Merge Dependabot pull requests automatically once approved

## Summary

Every Dependabot pull request gets GitHub's auto-merge turned on, so approving it is the only step: it squash-merges by itself once the required tests pass. Minor and patch updates of GitHub Actions and of devDependencies now arrive grouped, one pull request each.

## Why

Request: stop merging Dependabot pull requests by hand, but keep a review before anything lands.

## Design

- `.github/workflows/dependabot-auto-merge.yml` runs `gh pr merge --auto --squash` when Dependabot opens (or reopens) a pull request. This is the pattern in GitHub's [Automating Dependabot with GitHub Actions](https://docs.github.com/en/code-security/tutorials/secure-your-dependencies/automate-dependabot-with-actions).
- The gate is unchanged: the "Protect Master" ruleset needs one code-owner approval and the `Test (Node.js 22.x/24.x/26.x)` checks, and auto-merge waits for both. Approving is the review.
- Runtime dependency bumps: `check-version.sh` fails until a version bump commit is pushed (AGENTS.md), so auto-merge can't publish a release by itself. After you push that commit, the ruleset's "last push approval" means your own approval no longer counts; merge it with the admin bypass as before.
- Grouping: when one of several open pull requests merges, the strict "up to date" check makes the rest rebase, which dismisses their approvals. One grouped pull request per ecosystem avoids most of that. Runtime dependencies and major updates stay separate.
- Only Dependabot's own pull requests: the job runs when both the author and the triggering actor are `dependabot[bot]`. It uses `pull_request`, never `pull_request_target`, checks out nothing and needs no secrets.
- Not picked: having the workflow approve patch and minor updates itself. The approval must come from the code owner, and approving with `GITHUB_TOKEN` would also need "Allow GitHub Actions to create and approve pull requests", which weakens the ruleset. `dependabot/fetch-metadata` isn't needed when every update waits for a person, so no new third-party action. Renovate: a new tool for the same result. `@dependabot merge` comments: retired by GitHub on 2026-01-27.

No version bump: only workflows, Dependabot settings and docs change.

## Files

- `.github/workflows/dependabot-auto-merge.yml`: new.
- `.github/dependabot.yml`: `groups` for both ecosystems.
- `AGENTS.md`: a line on what approving a Dependabot pull request does.
- `docs/README.md`: index line.

## Docs updated

This note, the index and `AGENTS.md`. The README and guides are for users and describe nothing that changed.

## Verified / not verified

- ✅ Both YAML files parse. The ruleset, read through the API: one code-owner approval, last-push approval, dismiss stale reviews, strict required checks `Test (Node.js 22.x/24.x/26.x)`, squash allowed.
- ❌ The workflow itself: it only runs on a Dependabot pull request after this merges.
- ❌ "Allow auto-merge" is off in the repository settings. It must be turned on, or the step fails.

## Follow-ups

- Dependabot pull requests opened before this merges don't get auto-merge; turn it on by hand or comment `@dependabot recreate`.
