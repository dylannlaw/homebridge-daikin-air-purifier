# Capturing `clientSecret` and `terminalId` with mitmproxy

> Part of the [Homebridge Daikin Air Purifier](../../README.md) docs. See also [How it works](how-it-works.md).

Cloud status needs `clientSecret`. Control needs `clientSecret` and `terminalId`. Daikin doesn't publish either value, so you have to read them once from the Daikin Smart App's own traffic. This guide shows how to do that with [mitmproxy](https://mitmproxy.org) on a Mac or Linux computer and an iPhone.

> **Before you start.** This guide inspects the Daikin Smart App's own traffic. Daikin hasn't approved this, and it may go against the terms you accepted for the Daikin Smart App and CLUB DAIKIN. You can read the app's licence agreement (利用許諾書) in the app's settings. Whether you do this is up to you, and so is the risk to your Daikin account. See the [Disclaimer](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/README.md#disclaimer) in the README. If you only need status, [local mode](https://github.com/dylannlaw/homebridge-daikin-air-purifier/blob/master/README.md#local-mode-status-only) needs none of this.

> **This may not work with the current app.** Since the Daikin Smart App was updated (version 10.x, November 2026), people haven't been able to capture these values:
>
> - The app is built with Flutter, and **it ignores the iPhone's Wi-Fi proxy setting**. A packet capture showed the app connecting straight to `*.daikinsmartdb.jp` while a proxy was set, so ordinary proxy mode sees nothing from it.
> - When its traffic was intercepted, the app refused the connection (for example with error `0406`). It may check the server's certificate itself and ignore certificates you trust on the phone.
>
> The steps below use mitmproxy's **WireGuard mode**, which routes all of the phone's traffic through mitmproxy, so the app can't skip it the way it skips a proxy. Whether the app then accepts mitmproxy's certificate **hasn't been tested yet**. If you try it, please report what happened in [#2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/issues/2), without posting your values.

## What you're looking for

| Setting | Request | Where in the request |
|---|---|---|
| `clientSecret` | `POST https://prod-dsioti.daikinsmartdb.jp/dsioti/oauth2/token` (sent when you log in, and when the app renews its tokens) | `client_secret` in the request body |
| `terminalId` | `GET https://api.daikinsmartdb.jp/cleaner/set_control_info` (sent when you change a setting in the app) | `terminalid` in the query string |
| `refreshToken` (optional) | The same `oauth2/token` request | `refresh_token` in the **response** body |

`clientSecret` belongs to the app rather than your account, so it's most likely the same for everyone (not confirmed). `terminalId` most likely belongs to your app installation. You only need the first two; `refreshToken` is an [advanced setting](how-it-works.md#advanced-settings) and the plugin logs in with your email and password without it.

## Keep your capture private

While the capture is running, mitmproxy can read everything the phone sends, including your Daikin password and tokens, and traffic from other apps.

- Only capture Daikin's hosts once the certificate is installed (the `--allow-hosts` option in [step 3](#step-3-trust-mitmproxys-certificate-on-the-iphone) does that).
- Don't save the capture, and never post it, a screenshot of it, or the values from it in an issue or chat. If you need help, replace the values with fakes.
- When you're done, stop mitmproxy, turn off the VPN on the phone, and remove the mitmproxy certificate (see [Clean up](#step-6-clean-up)).

## What you need

- A Mac or Linux computer on the **same Wi-Fi** as your iPhone.
- mitmproxy 11 or later. On a Mac: `brew install mitmproxy`. Otherwise see [mitmproxy's install page](https://docs.mitmproxy.org/stable/overview-installation/).
- The [WireGuard app](https://apps.apple.com/app/id1441195209) on the iPhone.
- The Daikin Smart App, signed in, with your purifier already added.

## Step 1: Start mitmproxy in WireGuard mode

```sh
mitmweb --mode wireguard
```

`mitmweb` opens its web interface in your browser (usually `http://127.0.0.1:8081`). The WireGuard server listens on UDP port `51820`; if your computer's firewall asks, allow incoming connections for mitmproxy.

Start it without any other options for now: it has to intercept `mitm.it` in step 3 to hand out its certificate. You'll limit it to Daikin's hosts at the end of step 3.

## Step 2: Connect the iPhone

1. In mitmweb, open **Capture** (or the mode's details) to show the WireGuard QR code.
2. On the iPhone, open the WireGuard app, tap **+** → **Create from QR code**, scan it, and allow the VPN configuration.
3. Turn the tunnel on.

To check it works, open any website in Safari. It should appear in mitmweb (with a certificate warning in Safari until step 3).

## Step 3: Trust mitmproxy's certificate on the iPhone

1. With the tunnel on, open `http://mitm.it` in **Safari** and download the iOS certificate. Allow the profile download.
2. Open **Settings → General → VPN & Device Management**, tap the **mitmproxy** profile and **Install** it.
3. Open **Settings → General → About → Certificate Trust Settings** and turn on full trust for **mitmproxy**.

Without the last step every intercepted HTTPS request fails.

If `http://mitm.it` says "traffic is not going through mitmproxy", you're seeing the real mitm.it website, so the request didn't reach mitmproxy. Check that:

- mitmweb was started **without** `--allow-hosts` (or any other filter).
- The tunnel is on in the WireGuard app, and its **Latest handshake** is recent. If there's no handshake, your phone can't reach your computer: check they're on the same Wi-Fi, and that the firewall allows UDP port `51820`.
- **iCloud Private Relay** and other VPNs are off (**Settings → [your name] → iCloud → Private Relay**).
- You typed `http://`, not `https://`.

Now stop mitmweb (Ctrl+C) and start it again so it only decrypts Daikin's hosts. This keeps your other apps' traffic out of the capture:

```sh
mitmweb --mode wireguard --allow-hosts 'daikinsmartdb\.jp'
```

Don't end the pattern with `$`: mitmproxy matches it against `host:port` (for example `api.daikinsmartdb.jp:443`), so `daikinsmartdb\.jp$` never matches and nothing is decrypted. You'd see only DNS lookups (shown as `QUERY`) for Daikin's hosts.

mitmproxy keeps its WireGuard keys (in `~/.mitmproxy`), so the tunnel on the phone keeps working; turn it off and on again if it doesn't reconnect. Other traffic still passes through the tunnel, but isn't decrypted or shown.

## Step 4: Make the app send the requests

In mitmweb, type `daikinsmartdb` in the search box so only Daikin requests are listed.

1. **For `clientSecret`:** in the Daikin Smart App, sign out and sign in again. The `oauth2/token` request is sent right after the login page.
2. **For `terminalId`:** open your purifier in the app and change something, for example the fan speed. Change it back afterwards.

## Step 5: Read the values

- Click the `POST …/dsioti/oauth2/token` request, open **Request**, and copy the value after `client_secret`. That's `clientSecret`.
- Click a `GET …/cleaner/set_control_info` request and copy the value of `terminalid` from its query string. That's `terminalId`.

Put them in the plugin's settings in the Homebridge UI, or in your `config.json` (see [Configuration](../../README.md#configuration)), and restart Homebridge. The plugin then logs in by itself; you won't need mitmproxy again unless Daikin changes the app's secret or you reinstall the app.

## Step 6: Clean up

1. Stop mitmweb (Ctrl+C in its terminal). Nothing is saved unless you saved it.
2. On the iPhone, turn the tunnel off in the WireGuard app, and delete it.
3. Remove the certificate: **Settings → General → VPN & Device Management → mitmproxy → Remove Profile**. Leaving a trusted interception certificate on your phone is a security risk.
4. Open the Daikin Smart App and check it still works. Sign in again if it asks.

## If it doesn't work

| What you see | What it means |
|---|---|
| No Daikin requests in mitmweb, and the app works normally | The traffic isn't going through mitmproxy. Check the tunnel is on and has a recent handshake, and that `--allow-hosts` matches (try without it). |
| The app shows an error such as `0406` or "can't connect", and mitmweb shows a failed TLS handshake for a `daikinsmartdb.jp` host | The app rejected mitmproxy's certificate. This is the problem described at the top; there's no known way around it yet. Please report it in [#2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/issues/2) with your app version. |
| Safari can't open any HTTPS page | The certificate isn't fully trusted. Repeat [step 3](#step-3-trust-mitmproxys-certificate-on-the-iphone). |
| You see `oauth2/token` but no `client_secret` in it | Note what the request does contain (names only, not values) and report it in [#2](https://github.com/dylannlaw/homebridge-daikin-air-purifier/issues/2). The login may have changed. |

Without `clientSecret` the plugin still reads status from the purifier's local IP (`host`).
