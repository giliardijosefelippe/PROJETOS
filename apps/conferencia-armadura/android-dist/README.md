# Built APK artifacts for field install

Filenames include **name + version** and prior builds are kept:

- `CONF ARMADURA 0.1.07-20261114.apk` — install this (and keep older `CONF ARMADURA 0.*.apk` files)
- From 0.1.07: appears in **Abrir com** for PDF (VIEW/SEND)
- `conf-armadura-debug.apk` — alias of the latest build only (for local scripts)

Rebuild:

```bash
cd apps/conferencia-armadura
npm run apk:debug      # writes versioned APK; does not delete older versioned APKs
npm run pack:desktop   # Desktop folder with versioned HTML + APK
```

Desktop Windows sync (keep previous versions):

```powershell
powershell -File apps/conferencia-armadura/scripts/sync-desktop-windows.ps1
```
