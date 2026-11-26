# Split the README into a short overview and guides

## Summary

The README now covers only what most users need: what works, known limitations, installation, configuration, and a "More documentation" table. Details moved into two user guides in `docs/guides/`: **How it works** and **Testing locally with your iPhone**.

## Why

After the local testing guide was added, the README was long, and most of it was about things a first-time user doesn't need. The request was to move the local testing information into its own document, link the two, and find what else could be grouped.

## Design

What a reader needs first stays in the README. The rest is grouped by question:

| README section before | Now | Why |
|---|---|---|
| What works, Known limitations | README | What a user checks first. Added a link to How it works. |
| (none) | README: **Installation** | There was no install step. It's two lines: the Homebridge UI's Plugins page, or `npm install -g`. |
| Configuration: examples, settings table, `clientSecret` note | README | Needed by everyone who sets it up. |
| How login works | `how-it-works.md` | How the plugin behaves, not something to set. |
| How API calls are kept low | `how-it-works.md` | Same. |
| Advanced settings | `how-it-works.md` | Most users leave them empty; the README links to them by anchor. |
| Testing locally with your iPhone | `testing-locally.md` | For people trying unreleased changes, not for installing. |
| (none) | `how-it-works.md`: **Local status, cloud control** | Explains why control needs a Daikin account and sensors don't, which the README only hinted at. |

- The README's "More documentation" table links both guides, the security policy and the contributing rules (`AGENTS.md`). Each guide links back to the README and to the other guide.
- README links to the guides are full GitHub URLs to `master`. `docs/` is in `.npmignore`, so relative links would be broken on npmjs.com and in the Homebridge UI, which show the published README. Links between guides are relative.
- Considered and not picked: one long `docs/USAGE.md` with everything (still one long page to scroll); a separate guide just for advanced settings (four lines, and they only make sense with the login explanation); moving the settings table out of the README (it's the part everyone needs).

## Files

- `README.md`: added Installation and More documentation; removed How login works, Advanced settings, How API calls are kept low and the testing guide.
- `docs/guides/how-it-works.md`: new. Local status and cloud control, login and tokens, API calls, advanced settings.
- `docs/guides/testing-locally.md`: new. The testing guide from the README, unchanged apart from its headings and links.
- `AGENTS.md`: points to the guides, and says to keep the README short and link guides with full URLs.
- `docs/README.md`: a Guides section and this note.

## Docs updated

All of the above. `config.schema.json` is unchanged.

## Verified / not verified

- ✅ Every relative link and anchor in the README, the guides, `AGENTS.md` and `docs/README.md` resolves to a file and heading that exist (checked with a script).
- ✅ No text was lost: every sentence from the removed README sections is in one of the guides.
- ✅ `npm run lint && npm test` passes.
- ❌ The full `blob/master/docs/guides/…` URLs in the README return 404 until this PR is merged.
- ❌ I haven't looked at the rendered pages on GitHub or npm.
