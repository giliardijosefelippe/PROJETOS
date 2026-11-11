#!/usr/bin/env bash
# Sync Capacitor www/ from HTML + Prumo PdfViewer + conference module.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WWW="$ROOT/www"
rm -rf "$WWW"
mkdir -p "$WWW"

cp -f "$ROOT/conferencia-armadura.html" "$WWW/index.html"
cp -f "$ROOT/conference-app.mjs" "$WWW/conference-app.mjs"
cp -f "$ROOT/prumo-android-safe.mjs" "$WWW/prumo-android-safe.mjs"
cp -f "$ROOT/demo-pilares-vigas.pdf" "$WWW/demo-pilares-vigas.pdf"

# PdfViewer module + vendor (asset paths resolve via PrumoAssets → prumo/vendor/pdf)
mkdir -p "$WWW/prumo"
cp -f "$ROOT/prumo/pdf-view.js" "$WWW/prumo/pdf-view.js"
cp -a "$ROOT/prumo/vendor" "$WWW/prumo/vendor"

# Also expose ./vendor/pdf for document.baseURI fallbacks inside pdf-view.js
mkdir -p "$WWW/vendor"
cp -a "$ROOT/prumo/vendor/pdf" "$WWW/vendor/pdf"

echo "www synced: index.html + conference-app.mjs + prumo-android-safe.mjs + prumo/pdf-view.js + vendor/pdf"
