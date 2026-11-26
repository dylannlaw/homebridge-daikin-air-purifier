# Contributing

Thanks for wanting to help! Bug reports, test results from your own purifier, documentation fixes, ideas and code are all welcome, and you don't need to be a Homebridge expert to make a difference. Please be kind and patient with each other.

## Ways to help

- **Report your purifier.** Only the MCK70W on firmware 3.17.0-g4 has been tested. If you try another model or firmware, [open an issue](https://github.com/dylannlaw/homebridge-daikin-air-purifier/issues/new/choose) and say what worked and what didn't.
- **Confirm cloud mode.** Cloud status and control are new and not yet confirmed working end to end, and neither is the [credential capture guide](docs/guides/capturing-credentials.md) with the current Daikin Smart App. Your results are valuable either way.
- **Report a bug or suggest a feature** with the [issue templates](https://github.com/dylannlaw/homebridge-daikin-air-purifier/issues/new/choose).
- **Improve the docs.** Anything that confused you is worth fixing.
- **Send code.** For a larger change, open an issue first so we can agree on the approach before you spend time on it.

## Keep your secrets private

Before you post logs, config, screenshots or traffic captures, remove your Daikin email and password, tokens, `clientSecret`, `terminalId` and anything else that identifies you or your network. Use obvious fakes in code, tests and docs.

Found a security problem? Don't open a public issue. Follow the [Security policy](SECURITY.md).

## Set up the project

You need [Git](https://git-scm.com) and [Node.js](https://nodejs.org) 22.12 or later. [Fork the repository](https://github.com/dylannlaw/homebridge-daikin-air-purifier/fork), then:

```sh
git clone https://github.com/<your-username>/homebridge-daikin-air-purifier.git
cd homebridge-daikin-air-purifier
npm ci
npm run lint && npm test
```

The tests need no purifier and no Daikin account. To try your change in the Home app, run `npm run homebridge:local` and follow [Testing locally with your iPhone](docs/guides/testing-locally.md).

| Path | What's there |
|---|---|
| `src/client.ts` | The Daikin cloud and local network calls |
| `src/Service/` | One file per HomeKit service |
| `config.schema.json` | The settings form in the Homebridge UI |
| `test/` | Tests, run with `node --test` |
| `docs/` | Guides, plans, change notes and research ([index](docs/README.md)) |

## Make a change

[`AGENTS.md`](AGENTS.md) is the full working agreement, for people as well as AI agents, and [`docs/WORKFLOW.md`](docs/WORKFLOW.md) shows the flow. In short:

1. Create a branch from `master`. Keep each pull request to one logical change.
2. For a larger change (a new HomeKit service or setting, or anything about login, tokens or API calls), write a short [plan](docs/plans/TEMPLATE.md) first.
3. Make the change and add tests. Tests must not call the real Daikin API.
4. Run `npm run lint && npm test`.
5. Update the docs your change affects, and add a [change note](docs/changes/TEMPLATE.md) unless the change is trivial.
6. If you changed the plugin itself (`src/`, `config.schema.json`, `tsconfig.json`, or what users install from `package.json`), raise the version with `npm version patch --no-git-tag-version` (or `minor`, `major`) and add a [`CHANGELOG.md`](CHANGELOG.md) entry. Changes to docs and tests need neither.
7. Write commit messages as `type(scope): summary`, with `feat`, `fix`, `docs`, `test`, `chore` or `refactor` as the type.
8. Open a pull request against `master` and fill in the checklist.

Not sure about a step? Open the pull request anyway and ask. We can finish it together.

**No purifier?** You can still contribute. Say in the pull request what you couldn't check on a real device.

## What happens next

The tests run on your pull request, and the maintainer reviews it. Merging a plugin change publishes the new version to npm right away.

By contributing, you agree that your work is licensed under the project's [Apache License 2.0](LICENSE).
