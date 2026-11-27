#!/usr/bin/env bash
# Run this plugin in a private Homebridge on your own computer, so you can configure it in the
# Homebridge web UI and test it from the Home app on your iPhone.
#
#   npm run homebridge:local              build, install and start (the default)
#   npm run homebridge:local -- reset     forget the HomeKit pairing (remove the bridge from Home first)
#   npm run homebridge:local -- clean     delete everything this script created
#
# Everything lives in .homebridge-local/ in the repository (ignored by git and npm). It never touches
# ~/.homebridge or a Homebridge you already run. The plugin is installed from an `npm pack` tarball,
# so you test exactly what would be published.
#
# Settings (environment variables, all optional):
#   DAIKIN_HOST     the purifier's local IP; skips the question on first run
#   HB_LOCAL_DIR    where to keep the test Homebridge   (default: .homebridge-local)
#   HB_UI_PORT      port of the Homebridge web UI       (default: 8581, first run only)
#   HB_BRIDGE_PORT  HomeKit port of the test bridge     (default: 51827, first run only)
#
# Works with the bash that ships with macOS (3.2) and on Linux. Needs Node.js 22.12 or later.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEV_DIR="${HB_LOCAL_DIR:-$ROOT/.homebridge-local}"
STORAGE="$DEV_DIR/storage"
PLUGINS="$DEV_DIR/plugins"
CONFIG="$STORAGE/config.json"
UI_PORT="${HB_UI_PORT:-8581}"
BRIDGE_PORT="${HB_BRIDGE_PORT:-51827}"
UI_PACKAGE="homebridge-config-ui-x@^5"

say() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!!\033[0m %s\n' "$*" >&2; }
die() { printf '\033[1;31mxx\033[0m %s\n' "$*" >&2; exit 1; }

usage() {
  sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
}

check_node() {
  command -v node >/dev/null 2>&1 || die "Node.js is not installed. Install Node.js 22 LTS or later from https://nodejs.org."
  command -v npm >/dev/null 2>&1 || die "npm is not installed."
  node -e '
    const [major, minor] = process.versions.node.split(".").map(Number);
    if (major < 22 || (major === 22 && minor < 12)) process.exit(1);
  ' || die "Node.js $(node -v) is too old. The Homebridge web UI needs Node.js 22.12 or later."
}

# Prints the local IP addresses of this computer, so the user knows where the web UI is.
local_ips() {
  node -e '
    const os = require("os");
    for (const list of Object.values(os.networkInterfaces())) {
      for (const a of list || []) if (a.family === "IPv4" && !a.internal) console.log(a.address);
    }
  '
}

build_and_install() {
  if [ ! -x "$ROOT/node_modules/.bin/homebridge" ]; then
    say "Installing the project's dependencies (npm ci)"
    (cd "$ROOT" && npm ci --no-audit --no-fund)
  fi

  say "Building the plugin"
  (cd "$ROOT" && npm run build --silent)

  mkdir -p "$DEV_DIR/pack" "$PLUGINS" "$STORAGE"
  rm -f "$DEV_DIR/pack/"*.tgz
  say "Packing the plugin the way npm would publish it"
  local tarball
  tarball="$(cd "$ROOT" && npm pack --silent --pack-destination "$DEV_DIR/pack" | tail -n 1)"
  [ -f "$DEV_DIR/pack/$tarball" ] || die "npm pack did not produce a tarball."

  if [ ! -f "$PLUGINS/package.json" ]; then
    printf '{\n  "name": "homebridge-local-plugins",\n  "private": true\n}\n' > "$PLUGINS/package.json"
  fi

  # Homebridge itself is the version the plugin is built and tested against (the devDependency).
  local hb_version
  hb_version="$(node -p "require('$ROOT/node_modules/homebridge/package.json').version")"

  say "Installing the plugin, Homebridge $hb_version and the Homebridge web UI into $PLUGINS"
  # The plugin is reinstalled every run so code changes are picked up.
  (cd "$PLUGINS" && npm install --no-audit --no-fund --loglevel=error \
    "$DEV_DIR/pack/$tarball" "homebridge@$hb_version" "$UI_PACKAGE")
}

# Plugin 3.0 is a platform: moves a DaikinAirPurifier block written by an older version of this script from
# "accessories" to "platforms", keeping its settings.
migrate_config() {
  CONFIG="$CONFIG" node -e '
    const fs = require("fs");
    const config = JSON.parse(fs.readFileSync(process.env.CONFIG, "utf8"));
    const old = (config.accessories || []).filter((a) => a.accessory === "DaikinAirPurifier");
    if (!old.length) process.exit(0);
    config.accessories = config.accessories.filter((a) => !old.includes(a));
    config.platforms = config.platforms || [];
    for (const { accessory, ...settings } of old) config.platforms.push({ platform: accessory, ...settings });
    fs.writeFileSync(process.env.CONFIG, JSON.stringify(config, null, 4) + "\n", { mode: 0o600 });
    console.log("Moved the purifier from accessories to platforms (plugin 3.0 is a platform).");
  '
}

# Creates config.json on the first run: a test bridge with its own name, ID and PIN, the web UI,
# and the purifier if you give its IP. Credentials are entered later in the web UI, not here.
write_config() {
  if [ -f "$CONFIG" ]; then
    say "Using the existing config: $CONFIG"
    migrate_config
    return
  fi

  local host="${DAIKIN_HOST:-}"
  if [ -z "$host" ] && [ -t 0 ]; then
    printf "Purifier's local IP (e.g. 192.168.1.50), or leave empty to add it in the web UI: "
    read -r host || true
  fi
  if [ -n "$host" ] && ! printf '%s' "$host" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; then
    die "\"$host\" is not an IPv4 address."
  fi

  say "Writing a new config: $CONFIG"
  DAIKIN_HOST="$host" UI_PORT="$UI_PORT" BRIDGE_PORT="$BRIDGE_PORT" CONFIG="$CONFIG" node -e '
    const crypto = require("crypto");
    const fs = require("fs");

    const hex = () => crypto.randomBytes(1).toString("hex").toUpperCase();
    const username = ["0E", hex(), hex(), hex(), hex(), hex()].join(":");

    // HomeKit refuses trivial PINs, so pick a random one that is not on its list.
    const banned = new Set(["00000000", "11111111", "22222222", "33333333", "44444444", "55555555",
      "66666666", "77777777", "88888888", "99999999", "12345678", "87654321"]);
    let digits;
    do { digits = String(crypto.randomInt(0, 1e8)).padStart(8, "0"); } while (banned.has(digits));
    const pin = `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;

    const config = {
      bridge: {
        name: `Daikin Test ${username.slice(-5).replace(":", "")}`,
        username,
        port: Number(process.env.BRIDGE_PORT),
        pin,
      },
      accessories: [],
      platforms: [{ platform: "config", name: "Config", port: Number(process.env.UI_PORT) }],
    };
    if (process.env.DAIKIN_HOST) {
      config.platforms.push({
        platform: "DaikinAirPurifier",
        name: "DaikinAirPurifier",
        host: process.env.DAIKIN_HOST,
        cacheDuration: 60,
      });
    }
    fs.writeFileSync(process.env.CONFIG, JSON.stringify(config, null, 4) + "\n", { mode: 0o600 });
  '
}

print_instructions() {
  local pin ip
  pin="$(CONFIG="$CONFIG" node -e 'console.log(require(process.env.CONFIG).bridge.pin)')"
  # The UI port can be changed in the UI later, so read it from the config rather than HB_UI_PORT.
  UI_PORT="$(CONFIG="$CONFIG" node -e '
    const ui = (require(process.env.CONFIG).platforms || []).find((p) => p.platform === "config");
    console.log((ui && ui.port) || 8581);
  ')"
  ip="$(local_ips | head -n 1)"
  cat <<EOF

────────────────────────────────────────────────────────────────────────────
 Test Homebridge is starting.

 1. Web UI:  http://localhost:$UI_PORT${ip:+   (from your phone: http://$ip:$UI_PORT)}
    On first visit it asks you to create a login; it only exists in this test setup.
 2. Configure: Plugins → Homebridge Daikin Air Purifier → Settings. Enter the IP,
    and your Daikin email, password, clientSecret and terminalId for control.
    Save, then press Restart (top right of the UI).
 3. iPhone (on the same Wi-Fi as this computer): Home app → + → Add Accessory →
    scan the QR code on the web UI's Status page, or tap More options…, pick
    the "Daikin Test …" bridge and enter the setup code: $pin
    On a Mac, allow incoming connections for "node" if the firewall asks.
 4. Changed the code? Press Ctrl+C and run this again: it rebuilds and
    reinstalls, and your settings and pairing are kept.

 Don't update or reinstall this plugin from the web UI's Plugins page: that
 would replace your local build with the version on npm.
────────────────────────────────────────────────────────────────────────────

EOF
}

# hb-service is the web UI's launcher: it serves the UI and runs Homebridge as a child process, and
# restarts it when you press Restart in the UI. Only plugins in $PLUGINS are loaded.
run_homebridge() {
  local extra=""
  # hb-service refuses to run as root (e.g. in a container or with sudo) unless told to.
  if [ "$(id -u)" = "0" ]; then
    warn "Running as root. Prefer your normal user account."
    extra="--allow-root"
  fi
  exec "$PLUGINS/node_modules/.bin/hb-service" run \
    -U "$STORAGE" -P "$PLUGINS/node_modules" --strict-plugin-resolution --stdout $extra
}

cmd_start() {
  check_node
  build_and_install
  write_config
  print_instructions
  run_homebridge
}

cmd_reset() {
  [ -d "$STORAGE" ] || die "Nothing to reset: $STORAGE does not exist."
  warn "Remove the \"Daikin Test …\" bridge from the Home app first, or it will show as not responding."
  rm -rf "$STORAGE/persist" "$STORAGE/accessories"
  # A new bridge ID makes iOS treat it as a new accessory.
  CONFIG="$CONFIG" node -e '
    const crypto = require("crypto");
    const fs = require("fs");
    const config = JSON.parse(fs.readFileSync(process.env.CONFIG, "utf8"));
    const hex = () => crypto.randomBytes(1).toString("hex").toUpperCase();
    config.bridge.username = ["0E", hex(), hex(), hex(), hex(), hex()].join(":");
    config.bridge.name = `Daikin Test ${config.bridge.username.slice(-5).replace(":", "")}`;
    fs.writeFileSync(process.env.CONFIG, JSON.stringify(config, null, 4) + "\n", { mode: 0o600 });
  '
  say "Pairing forgotten. Your settings are kept. Run it again to pair as a new bridge."
}

cmd_clean() {
  [ -d "$DEV_DIR" ] || { say "Nothing to clean."; return; }
  warn "This deletes $DEV_DIR, including your test config, saved Daikin tokens and the HomeKit pairing."
  if [ -t 0 ]; then
    printf "Continue? [y/N] "
    local answer
    read -r answer || true
    case "$answer" in y|Y|yes|YES) ;; *) say "Cancelled."; return ;; esac
  fi
  rm -rf "$DEV_DIR"
  say "Deleted $DEV_DIR. Remove the \"Daikin Test …\" bridge from the Home app too."
}

case "${1:-start}" in
  start) cmd_start ;;
  reset) cmd_reset ;;
  clean) cmd_clean ;;
  -h|--help|help) usage ;;
  *) usage; exit 1 ;;
esac
