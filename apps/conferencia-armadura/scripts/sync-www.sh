#!/usr/bin/env bash
# Copy the single-file HTML app into Capacitor webDir (www/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/www/vendor/pdfjs" "$ROOT/www/restore-packages"
cp -f "$ROOT/conferencia-armadura.html" "$ROOT/www/index.html"
rm -f "$ROOT/www/demo-pilares-vigas.pdf"
# Local pdf.js (required on Android — CDN/worker hangs the WebView)
if [[ -f "$ROOT/vendor/pdfjs/pdf.min.js" ]]; then
  cp -f "$ROOT/vendor/pdfjs/pdf.min.js" "$ROOT/www/vendor/pdfjs/pdf.min.js"
  cp -f "$ROOT/vendor/pdfjs/pdf.worker.min.js" "$ROOT/www/vendor/pdfjs/pdf.worker.min.js"
else
  echo "ERROR: missing vendor/pdfjs — run scripts/fetch-pdfjs.sh" >&2
  exit 1
fi
# Built-in restore packages (JSON) for known pranchas
if [[ -d "$ROOT/restore-packages" ]]; then
  cp -f "$ROOT/restore-packages/"*.json "$ROOT/www/restore-packages/" 2>/dev/null || true
fi
echo "www synced from conferencia-armadura.html (+ vendor/pdfjs + restore-packages)"
