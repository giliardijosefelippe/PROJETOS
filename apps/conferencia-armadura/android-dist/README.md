# Built APK artifacts for field install

- `conf-armadura-debug.apk` — install on Android (debug-signed).
- Rebuild: `npm run apk:debug` from `apps/conferencia-armadura`.
- Includes local `vendor/pdfjs` so PDF open works offline in Capacitor WebView (CDA-15).
