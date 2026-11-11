#!/usr/bin/env bash
# Copy the single-file HTML app into Capacitor webDir (www/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/www"
cp -f "$ROOT/conferencia-armadura.html" "$ROOT/www/index.html"
cp -f "$ROOT/demo-pilares-vigas.pdf" "$ROOT/www/demo-pilares-vigas.pdf"
# Optional Capacitor bridge stub for browser preview of www/
if [[ ! -f "$ROOT/www/cordova.js" ]]; then
  printf '%s\n' '/* cordova/capacitor placeholder for static preview */' > "$ROOT/www/cordova.js"
fi
echo "www synced from conferencia-armadura.html"
