# CONF ARMADURA — conferência in loco

App de campo (pt-BR) para marcar a prancha PDF de armadura (pilares/vigas): OK, risco, seta, nota, tela ligada, giro da vista, relatório, **biblioteca de PDFs** e **autosave**.

## Uso principal

**`apps/conferencia-armadura/conferencia-armadura.html`** + **`conference-app.mjs`**

Sirva a pasta (módulos ES): `python3 -m http.server 8080` → `http://localhost:8080/conferencia-armadura.html`.

### Motor PDF = Prumo PdfViewer

- Fonte: `prumo/pdf-view.js` (não reescrito) + `prumo/vendor/pdf/`
- Preview CSS no gesto + refinement (~36 ms); **sem** `page.render` no `pointermove`
- Controles: páginas, zoom −/＋, fit, busca, rotate
- Overlay de anotações alinhado a `scale` / `x` / `y` / `rotation`

### Conferência (mantida)

- Dock flutuante ✓/✕ / riscar / seta / nota / relatório V·P·L / biblioteca 📚 / autosave / wake lock

## APK Android (instalável)

Arquivos gerados neste repo (nome + versão; versões anteriores são mantidas):

**`apps/conferencia-armadura/android-dist/CONF ARMADURA 0.1.07-20261114.apk`**

No Android, o app aparece em **Abrir com** para PDF (WhatsApp → Abrir com → CONF ARMADURA).

Alias local (sempre a última build): `android-dist/conf-armadura-debug.apk`

Desktop: `npm run pack:desktop` → `desktop-dist/CONF ARMADURA <versão>.html` + `.apk` (não apaga versões anteriores na pasta Desktop).

> **CDA-15:** o APK embute `vendor/pdfjs` (pdf.js + worker em blob). Não depende de CDN no celular — evita o freeze ao abrir PDF no WebView.

### Instalar no celular

1. Copie o `.apk` para o aparelho (USB, Drive, WhatsApp…).
2. Em **Configurações → Segurança**, permita instalar de fontes desconhecidas / o app que abrir o arquivo.
3. Abra o APK e instale (**CONF ARMADURA**). Versão: `0.mid.last-YYYYMMDD` (last 00–99; depois mid++).
4. Na 1ª abertura, permita armazenamento se o sistema pedir (gravação em Downloads).

> Build **release** assinada com keystore estável do projeto (`android/keystore/conf-armadura.keystore`). Mesmo `applicationId` + mesma cert = update in-place (não apaga biblioteca/anotações). Não regenerar o keystore.

### Pasta da biblioteca no aparelho

- Preferência: **`Download/ConfArmadura/`** (PDF + `.annots.json`)
- Fallback do app: Documents/Data `ConfArmadura/`
- Sempre também: IndexedDB + localStorage (reabre mesmo sem Files)

### Regenerar o APK (dev)

Requer Android SDK (`ANDROID_HOME`) + JDK:

```bash
cd apps/conferencia-armadura
npm install
npm run apk:debug
# → android-dist/CONF ARMADURA <versão>.apk (+ mantém APKs versionados anteriores)
npm run pack:desktop
# → desktop-dist/CONF ARMADURA <versão>.{html,apk}
```


Passos manuais:

```bash
npm run www          # copia HTML → www/
npx cap add android  # só na 1ª vez
npx cap sync android
cd android && ./gradlew assembleDebug
```

## Arquivos

| Caminho | Função |
|---------|--------|
| `conferencia-armadura.html` | App completo (fonte) |
| `android-dist/CONF ARMADURA <versão>.apk` | APK instalável versionado |
| `scripts/sync-desktop-windows.ps1` | Copia versionada p/ Desktop (Windows) |
| `android/` | Projeto Capacitor Android |
| `capacitor.config.json` | Config Capacitor (`webDir: www`) |

## Fora do escopo (v1)

OCR de tabelas de aço, sync multi-usuário, autenticação/backend.
