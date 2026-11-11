# Conf. Armadura — conferência in loco

App HTML/mobile (pt-BR) para abrir a prancha PDF de armadura (pilares/vigas), marcar trechos **OK** e **risco** no desenho, manter a tela ligada, girar a visualização sem virar o celular e exportar relatório.

Independente do app Next.js na raiz do monorepo.

## Rodar no navegador (preview)

```bash
cd apps/conferencia-armadura
npm install
npm run dev
```

Abra `http://localhost:5173` (ou o host da máquina na rede).

Build estático:

```bash
npm run build
npm run preview
```

Artefatos em `dist/` (adequado a hospedagem estática / Capacitor `webDir`).

## Uso em campo

1. O PDF demo (Sanluzzi Selenza — pilares e vigas) carrega automaticamente.
2. **Mover** / pinça = pan e zoom; **Riscar**, **OK**, **Risco**, **Seta**, **Nota** = marcar na prancha.
3. **Tela ligada** (topo) usa Wake Lock; no APK também `@capacitor-community/keep-awake`.
4. **⟳** gira a visualização 90° (marcações permanecem alinhadas).
5. **Relatório** lista riscos, OKs e notas; exporta HTML, copia texto ou compartilha.
6. **Abrir PDF** troca o arquivo (mesmo estilo de prancha); **Demo** recarrega o sample.

Offline: após o primeiro carregamento, o service worker cacheia o shell e o PDF demo.

## Gerar APK (Capacitor / Android)

Pré-requisitos: Node 20+, [Android Studio](https://developer.android.com/studio), JDK 17, variáveis Android SDK.

```bash
cd apps/conferencia-armadura
npm install
npm run build

# primeira vez
npx cap add android
npx cap sync

# abre o projeto nativo
npx cap open android
```

No Android Studio: **Build > Build Bundle(s) / APK(s) > Build APK(s)**.

Atalhos npm:

- `npm run cap:sync` — build web + `cap sync`
- `npm run cap:android` — sync e abre o Android Studio
- `npm run cap:add:android` — adiciona a plataforma Android

`appId`: `br.lunardeli.conferenciaarmadura` · `webDir`: `dist` · config em `capacitor.config.ts`.

Keep-awake nativo: o app tenta `@capacitor-community/keep-awake` quando roda no Capacitor; no browser usa a API Wake Lock.

## PDF demo

`public/pdfs/demo-pilares-vigas.pdf` — cópia de  
`2330_GAR_PILARES E VIGAS TUDO JUNTO_2025029_SANLUZZI_SELENZA_REV01.pdf`.

## Fora do escopo (v1)

OCR de tabelas de aço, sync multi-usuário, autenticação/backend.
