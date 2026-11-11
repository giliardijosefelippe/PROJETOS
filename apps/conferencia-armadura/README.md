# Conf. Armadura — conferência in loco

App de campo (pt-BR) para marcar a prancha PDF de armadura (pilares/vigas): OK, risco, seta, nota, tela ligada, giro da vista, relatório, **biblioteca de PDFs** e **autosave**.

## Uso principal — HTML único

**`apps/conferencia-armadura/conferencia-armadura.html`**

1. Duplo clique / abra no Chrome, ou sirva a pasta com `python3 -m http.server 8080`.
2. Demo: `demo-pilares-vigas.pdf` ao lado do HTML.
3. PDF.js (CDN) na 1ª abertura.

### Funções

- Toolbar flutuante (⋮⋮ recolhe); ✓ / ✕ sobre rótulos; mover / zoom / riscar / seta / nota
- **Biblioteca (📚)**: PDFs importados; reabrir; remove
- **Autosave**: marcações gravam sozinhas (localStorage + IndexedDB; no APK também em storage/`Download/ConfArmadura`)
- Sem botão “Salvar documento” — só **Confirmar** no modal de texto/motivo
- Relatório agrupado Vigas (V) / Pilares (P) / Lajes (L)

## APK Android (instalável)

Arquivo gerado neste repo:

**`apps/conferencia-armadura/android-dist/conf-armadura-debug.apk`**

> **CDA-15:** o APK embute `vendor/pdfjs` (pdf.js + worker em blob). Não depende de CDN no celular — evita o freeze ao abrir PDF no WebView.

### Instalar no celular

1. Copie o `.apk` para o aparelho (USB, Drive, WhatsApp…).
2. Em **Configurações → Segurança**, permita instalar de fontes desconhecidas / o app que abrir o arquivo.
3. Abra o APK e instale (**Conf. Armadura**).
4. Na 1ª abertura, permita armazenamento se o sistema pedir (gravação em Downloads).

> Build **debug** (assinatura de debug). Para Play Store use `assembleRelease` com keystore.

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
# → android-dist/conf-armadura-debug.apk
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
| `conferencia-armadura.html` | App completo |
| `demo-pilares-vigas.pdf` | Prancha demo |
| `android-dist/conf-armadura-debug.apk` | APK instalável |
| `android/` | Projeto Capacitor Android |
| `capacitor.config.json` | Config Capacitor (`webDir: www`) |

## Fora do escopo (v1)

OCR de tabelas de aço, sync multi-usuário, autenticação/backend.
