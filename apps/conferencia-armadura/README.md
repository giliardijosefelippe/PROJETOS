# Conf. Armadura — conferência in loco

App de campo (pt-BR) para marcar a prancha PDF de armadura (pilares/vigas): OK, risco, seta, nota, tela ligada, giro da vista e relatório.

## Uso principal — abra este HTML

Arquivo:

**`apps/conferencia-armadura/conferencia-armadura.html`**

1. Dê **duplo clique** no arquivo, ou arraste-o para o Chrome/Edge.
2. O PDF demo fica **ao lado**: `demo-pilares-vigas.pdf`.
3. Se a página abrir via `file://` e o demo não carregar sozinho (limitação do navegador), use **Abrir PDF** e escolha `demo-pilares-vigas.pdf`.
4. PDF.js vem de CDN na 1ª abertura (precisa de internet uma vez).

Não é necessário `npm` nem Vite para o dia a dia.

### Atalho opcional (servidor local)

Se quiser auto-carregar o demo sem escolher o arquivo:

```bash
cd apps/conferencia-armadura
python3 -m http.server 8080
# abra http://localhost:8080/conferencia-armadura.html
```

## Funções

- Abrir PDF (demo ou outro do mesmo estilo)
- Mover / zoom (pinça ou scroll), riscar, OK, risco, seta, nota
- **Tela ligada** (Wake Lock — melhor em http/https)
- **⟳** gira a visualização 90°
- **Relatório** com contagens; exportar HTML, copiar texto, compartilhar

## APK / Capacitor (caminho futuro, opcional)

Há também um esqueleto Vite + Capacitor nesta pasta (`package.json`, `capacitor.config.ts`) para quem for empacotar Android depois. **Não é necessário para usar o HTML.**

Resumo futuro:

```bash
npm install && npm run build
npx cap add android && npx cap sync && npx cap open android
```

## Arquivos importantes

| Arquivo | Função |
|---------|--------|
| `conferencia-armadura.html` | App completo (abrir este) |
| `demo-pilares-vigas.pdf` | Prancha demo (Sanluzzi Selenza) |

## Fora do escopo (v1)

OCR de tabelas de aço, sync multi-usuário, autenticação/backend.
