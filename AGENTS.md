# Working on homebridge-daikin-air-purifier

This file is the working agreement for anyone changing this repository, human or AI agent. Follow it for every change. (`CLAUDE.md` only points here, for tools that look for that file name.)

A Homebridge plugin (TypeScript, ESM, Node 22+) for the Daikin MCK70W air purifier. It reads sensors and status over the local network and controls the purifier through the Daikin cloud, logging in with the user's Daikin account. It runs inside a user's Homebridge and is published to npm as `@dylannlaw/homebridge-daikin-air-purifier`. See [`README.md`](README.md) for what users see.

The process is: read the history, plan, build, verify, document, record, pull request. [`docs/WORKFLOW.md`](docs/WORKFLOW.md) shows the flow. It needs no particular tool or agent.

## 1. Read the history first

1. [`docs/README.md`](docs/README.md): the index of plans, change notes and research.
2. [`README.md`](README.md) and [`config.schema.json`](config.schema.json): the behaviour and settings users rely on.
3. The code you will change, and its tests in `test/`.

If an idea was rejected before, don't bring it back without a new reason, and write that reason down. If the request conflicts with an earlier decision, stop and raise it.

## 2. Plan it in `docs/` before you build

If the change is more than a small fix (a new service or characteristic, a new or changed config option, anything in `src/client.ts` that changes how login, tokens or API calls work), copy [`docs/plans/TEMPLATE.md`](docs/plans/TEMPLATE.md) to `docs/plans/short-name.md` first.

## 3. Make the change

- Services live in `src/Service/`, one file per HomeKit service; the Daikin API and local calls live in `src/client.ts`.
- A new setting goes in `config.schema.json`, `src/types.d.ts` and the README configuration section together, and is documented before it is used.
- Security: the user's Daikin email, password, tokens, `clientSecret` and `terminalId` are secrets. Never log them or commit them, including in tests and docs; use obvious fakes. Keep API calls low (see "How API calls are kept low" in the README) so the user's account isn't rate-limited or locked.
- Keep dependencies few. Adding one needs a line in the change note explaining why nothing existing would do.

## 4. Verify

```sh
npm run lint && npm test
```

- **Logic:** tests are in `test/*.test.mjs` and run against the built `dist/` with `node --test`. They must not call the real Daikin API or need a purifier.
- **Real device:** control can only be confirmed against a real purifier and Daikin account. If you can't, say so in the change note.
- Write down anything you could not check in the change note. Never claim a thing was verified if it wasn't.

## 5. Update the docs in the same change

- **`README.md`**: always check it, and update it when anything it describes changes.
- **`config.schema.json`**: when settings change.
- **`CHANGELOG.md`**: kept for history up to 0.2.0. Don't edit it. Release notes for later versions are generated on each GitHub Release from the merged pull requests, so PR titles should read well to users.

## 6. Write a change note in `docs/changes/`

Every change that isn't trivial gets `docs/changes/YYYY-MM-DD-short-name.md` from [`docs/changes/TEMPLATE.md`](docs/changes/TEMPLATE.md), and a line in the index in `docs/README.md`, newest first.

## 7. Open the pull request

- One logical change per PR, on a branch, never straight to `master`.
- Fill in the checklist in [`.github/pull_request_template.md`](.github/pull_request_template.md).
- Commit messages: `type(scope): summary` (`feat`, `fix`, `docs`, `test`, `chore`, `refactor`).
- Every merge to `master` that changes the plugin (`src/`, `config.schema.json`, `tsconfig.json`, or `package.json` beyond devDependencies and scripts) publishes a new version to npm and a GitHub Release, through `.github/workflows/release.yml`. Docs, README, tests, workflows and devDependency bumps never release on their own; `.github/scripts/should-release.sh` decides. The patch number is set by CI, so don't edit the version in `package.json`, except to change MAJOR.MINOR (keep the patch at `.0`) when starting a new minor or major line. Treat every merge as a release.
- Never commit secrets, `.env` files or real account data.
