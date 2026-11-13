#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VER="${1:-3.11.174}"
DEST="$ROOT/vendor/pdfjs"
mkdir -p "$DEST"
BASE="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${VER}"
curl -fsSL -o "$DEST/pdf.min.js" "$BASE/pdf.min.js"
curl -fsSL -o "$DEST/pdf.worker.min.js" "$BASE/pdf.worker.min.js"
ls -lh "$DEST"
echo "pdf.js ${VER} vendored into vendor/pdfjs/"
