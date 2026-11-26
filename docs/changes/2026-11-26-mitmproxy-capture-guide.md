# Guide to capturing credentials with mitmproxy

## Summary

Added [`docs/guides/capturing-credentials.md`](../guides/capturing-credentials.md), a step-by-step guide to reading `clientSecret` and `terminalId` (and optionally `refresh_token`) from the Daikin Smart App's traffic with mitmproxy, linked from the README, `how-it-works.md` and the docs index.

## Why

The README told users to capture `clientSecret` and `terminalId` "with an HTTPS proxy" but never said how, and also said that capture no longer works. Users need the one approach still worth trying written down, honestly labelled as unconfirmed.

## Design

- **WireGuard mode, not proxy mode.** A packet capture on 2026-11-26 showed the app (Flutter, `Dart/3.6 (dart:io)`) ignoring the iPhone's Wi-Fi proxy and connecting straight to `*.daikinsmartdb.jp`. Proxy mode can't see it, so the guide doesn't describe it. WireGuard mode routes all of the phone's traffic through mitmproxy, so the app can't skip it.
- **Certificate rejection is stated up front.** Earlier interception attempts made the app fail with `0406`, which suggests it validates certificates itself. The guide says this hasn't been tested with WireGuard mode, and asks users to report results in issue #2 without posting values.
- **Privacy.** `--allow-hosts 'daikinsmartdb\.jp$'` limits decryption to Daikin's hosts; the guide says not to save or share the capture and to remove the certificate afterwards.
- Not covered: Android (Flutter apps there also ignore user-installed certificates by default, so it's no easier) and patching the app to disable certificate checks (out of scope for a user guide).

## Files

- `docs/guides/capturing-credentials.md`: new guide.
- `README.md`: known limitations and configuration point to the guide; added to the "More documentation" table.
- `docs/guides/how-it-works.md`: links the guide.
- `docs/README.md`: guide and change note in the index.

## Docs updated

All of the above. `config.schema.json` is unchanged: its descriptions already name the exact requests.

## Verified / not verified

- ✅ The request names and fields match `src/client.ts` and `docs/reference/daikin-smart-api.openapi.yaml`.
- ❌ The guide's steps were not run end to end against the current Daikin Smart App. Whether the app accepts mitmproxy's certificate in WireGuard mode is unknown.
- ❌ Not confirmed that `clientSecret` is the same for every user, or that `terminalId` is per installation; the guide says "most likely".

## Follow-ups

- Run the guide on a real iPhone and update it (and the README limitation) with the result.
