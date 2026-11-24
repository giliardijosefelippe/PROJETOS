#!/usr/bin/env bash
# Build release-signed APK (stable project keystore) as "CONF ARMADURA <version>.apk".
# Never deletes prior versioned APKs. Verifies signing cert SHA-256 after build.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
VERSION="$(bash scripts/app-version.sh)"
STEM="CONF ARMADURA ${VERSION}"
DIST="$ROOT/android-dist"
KS="$ROOT/android/keystore/conf-armadura.keystore"
EXPECTED_FILE="$ROOT/android/keystore/EXPECTED_SHA256.txt"
mkdir -p "$DIST"

if [[ ! -f "$KS" ]]; then
  echo "ERROR: missing stable keystore $KS" >&2
  exit 1
fi
EXPECTED="$(tr -d '[:space:]' < "$EXPECTED_FILE" | tr 'A-F' 'a-f')"
if [[ -z "$EXPECTED" || ${#EXPECTED} -ne 64 ]]; then
  echo "ERROR: invalid $EXPECTED_FILE" >&2
  exit 1
fi

npm run cap:sync
(
  cd android
  # assembleRelease with project signingConfigs.confArmadura (same key as debug override)
  ./gradlew assembleRelease
)

SRC="$ROOT/android/app/build/outputs/apk/release/app-release.apk"
if [[ ! -f "$SRC" ]]; then
  echo "ERROR: missing $SRC" >&2
  exit 1
fi

OUT="$DIST/${STEM}.apk"
cp -f "$SRC" "$OUT"
cp -f "$OUT" "$DIST/conf-armadura-debug.apk"
rm -f "$DIST/CONF ARMADURA.apk"

# Verify in-place-update cert (must match keystore + prior 0.1.09+ APKs)
GOT="$(apksigner verify --print-certs "$OUT" 2>/dev/null | awk '/SHA-256 digest:/{print $NF; exit}' | tr 'A-F' 'a-f')"
if [[ "$GOT" != "$EXPECTED" ]]; then
  echo "ERROR: APK cert SHA-256 mismatch." >&2
  echo "  expected: $EXPECTED" >&2
  echo "  got:      $GOT" >&2
  echo "  Refuse to ship — would break update-over-install." >&2
  exit 1
fi

echo "APK versioned (stable keystore SHA-256 ${GOT:0:12}…; priors kept):"
ls -lh "$OUT"
ls -1 "$DIST"/*.apk 2>/dev/null || true
