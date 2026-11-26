#!/usr/bin/env bash
# Checks, on a pull request, that the version in the repository stays in step with what is released.
#
# - If the plugin changed (should-release.sh says release=true), the version in package.json must be
#   raised above the base branch's version, because merging will publish it.
# - Whenever the version changes, package-lock.json must carry the same version and CHANGELOG.md must
#   have an entry for it (a heading like "## [1.2.3]" or "### [1.2.3]").
# - The version can never go down.
#
# Usage: check-version.sh BASE   (BASE: the commit the pull request is merged into)
set -euo pipefail

BASE="${1:?usage: check-version.sh BASE}"
SCRIPTS=$(dirname "$0")

OLD=$(git show "$BASE:package.json" | node -p 'JSON.parse(require("node:fs").readFileSync(0, "utf8")).version')
NEW=$(node -p 'require("./package.json").version')
LOCK=$(node -p 'require("./package-lock.json").version')

# 1 if $1 > $2, 0 if equal, -1 if lower (MAJOR.MINOR.PATCH only).
compare() {
  node -e '
    const [a, b] = process.argv.slice(1).map((v) => v.split(".").map(Number));
    for (let i = 0; i < 3; i++) if (a[i] !== b[i]) { console.log(a[i] > b[i] ? 1 : -1); process.exit(0); }
    console.log(0);
  ' "$1" "$2"
}

if ! [[ "$NEW" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "::error file=package.json::Version $NEW is not MAJOR.MINOR.PATCH."
  exit 1
fi

CMP=$(compare "$NEW" "$OLD")
if [ "$CMP" = "-1" ]; then
  echo "::error file=package.json::Version $NEW is lower than $OLD on the base branch."
  exit 1
fi

PLUGIN=$(bash "$SCRIPTS/should-release.sh" "$BASE" | tail -n 1)
if [ "$PLUGIN" = "release=true" ] && [ "$CMP" = "0" ]; then
  echo "::error file=package.json::The plugin changed, so merging this publishes a release. Raise the version" \
    "(npm version patch --no-git-tag-version, or minor/major) and add a CHANGELOG.md entry for it."
  exit 1
fi

if [ "$CMP" = "0" ]; then
  echo "Version unchanged at $NEW; nothing will be released."
  exit 0
fi

if [ "$LOCK" != "$NEW" ]; then
  echo "::error file=package-lock.json::package-lock.json has version $LOCK but package.json has $NEW." \
    "Use npm version $NEW --no-git-tag-version to change both."
  exit 1
fi

ESCAPED=${NEW//./\\.}
if ! grep -Eq "^#{2,3} \[$ESCAPED\]" CHANGELOG.md; then
  echo "::error file=CHANGELOG.md::CHANGELOG.md has no entry for $NEW. Add a \"## [$NEW]\" section at the top."
  exit 1
fi

echo "Version $OLD -> $NEW, with a CHANGELOG.md entry. Merging publishes $NEW if it is not on npm yet."
