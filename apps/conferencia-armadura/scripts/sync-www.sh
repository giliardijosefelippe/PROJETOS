#!/usr/bin/env bash
# Copy the single-file HTML app into Capacitor webDir (www/).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$ROOT/www/vendor/pdfjs"
cp -f "$ROOT/conferencia-armadura.html" "$ROOT/www/index.html"
cp -f "$ROOT/demo-pilares-vigas.pdf" "$ROOT/www/demo-pilares-vigas.pdf"
# Local pdf.js (required on Android — CDN/worker hangs the WebView)
if [[ -f "$ROOT/vendor/pdfjs/pdf.min.js" ]]; then
  cp -f "$ROOT/vendor/pdfjs/pdf.min.js" "$ROOT/www/vendor/pdfjs/pdf.min.js"
  cp -f "$ROOT/vendor/pdfjs/pdf.worker.min.js" "$ROOT/www/vendor/pdfjs/pdf.worker.min.js"
else
  echo "ERROR: missing vendor/pdfjs — run scripts/fetch-pdfjs.sh" >&2
  exit 1
fi
echo "www synced from conferencia-armadura.html (+ vendor/pdfjs)"
