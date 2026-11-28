# Say the plugin is unofficial, and what cloud mode risks

## Summary

The README now says, near the top and in a new Disclaimer section, that the plugin isn't affiliated with Daikin, that cloud mode uses the Daikin Smart App's service in a way Daikin hasn't approved and may go against its terms, and that users take the risk to their Daikin account. The mitmproxy guide gets the same warning before its steps.

## Why

We checked whether calling Daikin's API could create legal problems. What we found:

- The Daikin Smart App's own licence agreement (利用許諾書) is only shown inside the app. We couldn't find it online, so we haven't read it.
- Daikin's general website terms (`daikin.co.jp/policy.html`) don't mention apps, APIs or reverse engineering.
- A sister app, Daikin APP for Beside (which uses the same CLUB DAIKIN login), bans reverse engineering and decompiling, use outside personal use, commercial use without permission, redistribution, interfering with the service, and anything Daikin deems inappropriate. If a user breaks those terms, Daikin can end their use and claim damages. The Smart App's licence is probably similar.
- Daikin Japan doesn't offer the Smart App's cloud as a developer API. Daikin Europe's official Onecta developer portal doesn't cover these purifiers.

The terms bind each user who accepted them. Telling users plainly what cloud mode does, and giving them local mode as the alternative, is the honest thing to do. It also lowers the project's exposure. This isn't legal advice, and no lawyer has reviewed it.

## Design

- A one-line notice under the header images, so nobody installs the plugin without seeing it.
- A full **Disclaimer** section after "Good to know", added to the contents list: not affiliated (trademarks used only to say which purifiers it works with), unofficial API, the user's account risk, local mode as the alternative, no warranty under Apache 2.0 sections 7 and 8, and a way for Daikin to get in touch.
- A pointer in cloud-mode step 2 and a warning at the top of the mitmproxy guide, where users actually start capturing.
- Considered: removing the mitmproxy guide, or marking cloud mode experimental. Neither is done here, because they change how the plugin is used. A disclaimer comes first. Both stay open as follow-ups.

## Files

- `README.md`: top notice, Disclaimer section, contents entry, a pointer in cloud-mode step 2.
- `docs/guides/capturing-credentials.md`: the "Before you start" warning.
- `docs/README.md`: this note in the index.

## Docs updated

`README.md`, `docs/guides/capturing-credentials.md`, `docs/README.md`. The plugin's code doesn't change, so there's no version bump or CHANGELOG entry.

## Verified / not verified

- ✅ Anchors `#disclaimer`, `#how-often-it-checks-and-rate-limits` and `#local-mode-status-only` match headings in the README.
- ❌ We haven't read the Daikin Smart App's own licence agreement, which is only shown inside the app.
- ❌ No lawyer has reviewed the wording.

## Follow-ups

- Read the in-app licence agreement (利用許諾書) and update this note with what it actually says.
- Ask a Japanese IT lawyer whether the Unfair Competition Prevention Act (不正競争防止法) applies to a guide that shows how to capture the app's `clientSecret`.
- Consider recommending local mode by default and calling cloud mode experimental.
