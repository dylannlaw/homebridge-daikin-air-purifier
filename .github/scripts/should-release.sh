#!/usr/bin/env bash
# Decides whether the commits between BEFORE and HEAD change the plugin that users install.
# Prints "release=true" or "release=false" and the reason. Used by .github/workflows/release.yml.
#
# Releases for:
# - src/**              the plugin code
# - config.schema.json  the settings form users see in the Homebridge UI
# - tsconfig.json       how the plugin code is compiled
# - package.json        only when something other than devDependencies, scripts or version changed
#                       (e.g. runtime dependencies, engines, main), so dev tool bumps don't release
# Everything else (docs, README, tests, lint config, workflows, package-lock.json, which isn't
# published) never releases on its own.
#
# Usage: should-release.sh BEFORE   (BEFORE may be empty or all zeros; then HEAD^ is used)
set -euo pipefail

BEFORE="${1:-}"
if [ -z "$BEFORE" ] || ! git cat-file -e "${BEFORE}^{commit}" 2> /dev/null; then
  BEFORE=$(git rev-parse HEAD^)
fi

CHANGED=$(git diff --name-only "$BEFORE" HEAD)

CODE=$(printf '%s\n' "$CHANGED" | grep -E '^(src/|config\.schema\.json$|tsconfig\.json$)' || true)
if [ -n "$CODE" ]; then
  echo "Plugin files changed:"
  printf '  %s\n' $CODE
  echo "release=true"
  exit 0
fi

if printf '%s\n' "$CHANGED" | grep -qx 'package.json'; then
  OLD=$(git show "$BEFORE:package.json" 2> /dev/null || echo '{}')
  if OLD="$OLD" node -e '
    const strip = (s) => {
      const p = JSON.parse(s);
      delete p.devDependencies;
      delete p.scripts;
      delete p.version;
      return JSON.stringify(p);
    };
    const fs = require("node:fs");
    process.exit(strip(process.env.OLD) === strip(fs.readFileSync("package.json", "utf8")) ? 1 : 0);
  '; then
    echo "package.json changed what users install (not only devDependencies, scripts or version)."
    echo "release=true"
    exit 0
  fi
  echo "package.json changed only devDependencies, scripts or version."
fi

echo "No plugin files changed, nothing to release."
echo "release=false"
