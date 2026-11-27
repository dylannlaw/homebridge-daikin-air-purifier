# Testing locally with your iPhone

> Part of the [Homebridge Daikin Air Purifier](../../README.md) docs. See also [How it works](how-it-works.md).

Try the plugin, including changes that aren't released yet, in a private test Homebridge on your computer and control it from the Home app on your iPhone. One command sets it all up. It doesn't touch `~/.homebridge` or a Homebridge you already run.

## What you need

- A Mac or Linux computer on the **same Wi-Fi** as your iPhone and the purifier.
- [Node.js](https://nodejs.org) 22.12 or later (`node -v` to check) and [Git](https://git-scm.com).
- The purifier's local IP address (find it in your router's list of devices).
- For control: your Daikin account email and password, `clientSecret` and `terminalId` (see [Configuration](../../README.md#configuration)). Without them you can still test sensors and status.

## Step 1: Get the code

```sh
git clone https://github.com/dylannlaw/homebridge-daikin-air-purifier.git
cd homebridge-daikin-air-purifier
```

To test a branch or pull request, check it out first, for example `git checkout <branch-name>`.

## Step 2: Start the test Homebridge

```sh
npm run homebridge:local
```

On the first run the script:
1. installs the project's dependencies and builds the plugin,
2. packs it exactly as it would be published to npm,
3. installs it together with Homebridge and the Homebridge web UI into `.homebridge-local/` in the repository,
4. asks for the purifier's IP (press Enter to skip and add it in the web UI), and
5. creates a test bridge called **Daikin Test …** with its own setup code, and starts it.

Leave the terminal open: Homebridge runs until you press Ctrl+C, and its log is shown there.

## Step 3: Configure the plugin

1. Open **http://localhost:8581** in your browser. The script also prints an address you can open from your phone.
2. Create a login when asked. It only exists in this test setup.
3. Go to **Plugins**, find **Homebridge Daikin Air Purifier** and open its settings from the menu on its card.
4. Enter the purifier's IP, and for control your Daikin email, password, Client Secret, Terminal ID and Port. Click **Save**.
5. Click **Restart** (top right). Watch the log in the terminal or under **Logs** in the web UI; it says whether the purifier was reached and whether control is enabled.

## Step 4: Add it to the Home app

1. On your iPhone, open the **Home** app and tap **+ → Add Accessory**.
2. Scan the QR code on the web UI's **Status** page, or tap **More options…**, pick **Daikin Test …** and enter the setup code from the terminal.
3. Tap **Add Anyway** when iOS warns that it's an uncertified accessory, and finish the setup.

You should now see the air purifier, humidifier and the temperature, humidity and air quality sensors. Try turning it on and off and changing the fan speed, and check the result on the purifier and in the log.

## Step 5: Test a change

Edit the code, press Ctrl+C in the terminal and run `npm run homebridge:local` again. It rebuilds and reinstalls the plugin. Your settings and the pairing with your iPhone are kept, so there's no need to add it again.

To skip the restart by hand, start it in watch mode instead:

```sh
npm run homebridge:local -- watch
```

Each time you save a file in `src/`, `config.schema.json` or `package.json`, it rebuilds, packs and reinstalls the plugin, then restarts Homebridge (usually within a few seconds). The web UI restarts too, so refresh the browser tab. If the build fails, the error is shown and Homebridge stays stopped until you save a fix. Press Ctrl+C to stop.

Don't install or update this plugin from the web UI's **Plugins** page: that replaces your local build with the version on npm.

## Cleaning up

| Command | What it does |
|---|---|
| `npm run homebridge:local -- reset` | Forgets the HomeKit pairing but keeps your settings. Remove the bridge from the Home app first. |
| `npm run homebridge:local -- clean` | Deletes the whole test setup: config, saved Daikin tokens and pairing. Remove the bridge from the Home app too. |

## Troubleshooting

- **The Home app can't find the bridge.** Make sure your iPhone and computer are on the same Wi-Fi (not a guest network). On a Mac, allow incoming connections for "node" if the firewall asks, or allow it in **System Settings → Network → Firewall**.
- **"Address already in use" or another Homebridge is running.** Use other ports: run `npm run homebridge:local -- clean`, then `HB_UI_PORT=8582 HB_BRIDGE_PORT=51828 npm run homebridge:local`.
- **"Node.js … is too old".** Install Node.js 22 LTS or later from [nodejs.org](https://nodejs.org).
- **The accessory shows "No Response".** Check the log: the purifier's IP may be wrong or have changed. Give it a fixed IP in your router.
- **You removed the bridge from Home and can't add it again.** Run `npm run homebridge:local -- reset`, then start it again.
