#!/usr/bin/env bash
# Copy HTML + APK with NAME + VERSION filenames. Never deletes prior versioned files.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(bash "$ROOT/scripts/app-version.sh")"
APP_LABEL="CONF ARMADURA"
STEM="${APP_LABEL} ${VERSION}"

DIST="$ROOT/android-dist"
DESKTOP_OUT="${1:-$ROOT/desktop-dist}"
mkdir -p "$DIST" "$DESKTOP_OUT/vendor/pdfjs"

HTML_SRC="$ROOT/conferencia-armadura.html"
HTML_DST="$DESKTOP_OUT/${STEM}.html"
APK_VERSIONED="$DIST/${STEM}.apk"

if [[ ! -f "$HTML_SRC" ]]; then
  echo "ERROR: missing $HTML_SRC" >&2
  exit 1
fi

# HTML — versioned only (do not overwrite other versions; same version may refresh)
cp -f "$HTML_SRC" "$HTML_DST"

# APK — prefer already-built versioned artifact; else migrate legacy unversioned once
if [[ -f "$APK_VERSIONED" ]]; then
  :
elif [[ -f "$DIST/${APP_LABEL}.apk" ]]; then
  cp -f "$DIST/${APP_LABEL}.apk" "$APK_VERSIONED"
elif [[ -f "$DIST/conf-armadura-debug.apk" ]]; then
  cp -f "$DIST/conf-armadura-debug.apk" "$APK_VERSIONED"
else
  echo "ERROR: no APK in android-dist — run npm run apk:debug first" >&2
  exit 1
fi

cp -f "$APK_VERSIONED" "$DESKTOP_OUT/${STEM}.apk"

# Editable package + built-in restore JSON (keep versioned name + restore-packages/)
mkdir -p "$DESKTOP_OUT/restore-packages"
if ls "$ROOT/restore-packages"/*.confarmadura.json >/dev/null 2>&1; then
  cp -f "$ROOT/restore-packages"/*.confarmadura.json "$DESKTOP_OUT/restore-packages/"
  cp -f "$ROOT/restore-packages"/*.confarmadura.json "$DESKTOP_OUT/" 2>/dev/null || true
fi
if ls "$DIST"/*.confarmadura.json >/dev/null 2>&1; then
  cp -f "$DIST"/*.confarmadura.json "$DESKTOP_OUT/"
fi

if [[ -f "$ROOT/vendor/pdfjs/pdf.min.js" ]]; then
  cp -f "$ROOT/vendor/pdfjs/pdf.min.js" "$DESKTOP_OUT/vendor/pdfjs/pdf.min.js"
  cp -f "$ROOT/vendor/pdfjs/pdf.worker.min.js" "$DESKTOP_OUT/vendor/pdfjs/pdf.worker.min.js"
fi

cat > "$DESKTOP_OUT/COMO-ABRIR.txt" <<EOF
${APP_LABEL} ${VERSION}

Arquivos desta versão (manter as anteriores na pasta):
  ${STEM}.html
  ${STEM}.apk
  vendor/pdfjs/

Abrir HTML:
  npx --yes serve -l 5173
  http://localhost:5173/${STEM}.html

APK: instalar ${STEM}.apk no Android (applicationId br.lunardeli.conferenciaarmadura +
keystore estável android/keystore/conf-armadura.keystore).
Atualizar o APK NÃO apaga conferências, biblioteca nem anotações
(localStorage + IndexedDB + Download/ConfArmadura). Só desinstalar limpa.
Exceção: 0.1.08-20261117 usou outro keystore efêmero — desinstale 0.1.08 uma vez
antes de instalar 0.1.33+; depois os updates ficam in-place.
Nunca apague versões anteriores desta pasta.

Pacote editável (.confarmadura.json):
  Menu ☰ → Exportar pacote / Importar pacote
  (marcações + relatório em JSON; reabre no app no PC ou no telefone).

DUO HOME (Relatório 18/11/2026):
  Na 1ª abertura de "GAR_VIGAS E PILARES_EGD_2025012_ARJ_DUO HOME_REV01.pdf"
  sem marcações, o app preenche automaticamente as 64 do Relatório (só essa prancha).
  Pacote também em restore-packages/*.confarmadura.json (Exportar/Importar).
EOF

echo "Packed Desktop release:"
ls -lh "$DESKTOP_OUT/${STEM}.html" "$DESKTOP_OUT/${STEM}.apk"
echo "Prior versioned files kept under: $DESKTOP_OUT"
ls -1 "$DESKTOP_OUT" | sed -n '1,40p'
