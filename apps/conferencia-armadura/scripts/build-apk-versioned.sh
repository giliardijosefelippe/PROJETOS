#!/usr/bin/env bash
# Build debug APK and store as "CONF ARMADURA <version>.apk" without deleting prior versions.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(bash scripts/app-version.sh)"
STEM="CONF ARMADURA ${VERSION}"
DIST="$ROOT/android-dist"
mkdir -p "$DIST"

npm run cap:sync
(
  cd android
  ./gradlew assembleDebug
)

SRC="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
OUT="$DIST/${STEM}.apk"
cp -f "$SRC" "$OUT"
# Convenience alias for local install scripts (may overwrite — versioned file is the archive).
cp -f "$OUT" "$DIST/conf-armadura-debug.apk"
# Remove legacy unversioned name so Desktop sync stops shipping it as “current”.
rm -f "$DIST/CONF ARMADURA.apk"

echo "APK versioned (priors kept in android-dist/):"
ls -lh "$OUT"
ls -1 "$DIST"/*.apk 2>/dev/null || true
