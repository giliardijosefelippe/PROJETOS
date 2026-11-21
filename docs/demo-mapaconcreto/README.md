# Demo estático — MapaConcreto

Pacote HTML/CSS/JS **sem build** para testar o fluxo visual no browser.  
**Não substitui** o app Next.js + Supabase; dados ficam em `localStorage` marcados como **demonstração**.

## Arquivos

| Arquivo | Função |
|---------|--------|
| `index.html` | Painel de obras / entrada |
| `planta.html` | Canvas (PDF simulado), escala, retângulo/polígono/mão livre, aceite 62,5% / 3,75 m³ |
| `concretagem.html` | NF, Slump, volumes (teórico / mapeado / NF) sem rótulo “desperdício” |
| `styles.css` / `demo.js` | Estilos e estado compartilhado |

## Como abrir (mais fácil)

**1) Baixe o ZIP**

- No store: `mapaconcreto-demo-html.zip` (nesta pasta) ou  
  `/cursor/stores/bc-1f61a4cf-bf94-4c63-b310-38f22d21e01f/media/mapaconcreto-demo-html.zip`
- No GitHub (branch do demo):  
  https://github.com/giliardijosefelippe/PROJETOS/raw/cursor/mapaconcreto-static-demo-539b/docs/demo-mapaconcreto/mapaconcreto-demo-html.zip

Extraia no PC → duplo clique em `index.html`.

**2) Servidor local (se o browser bloquear file://)**

```bash
cd pasta-extraida
python3 -m http.server 8765
```

Abra http://127.0.0.1:8765/

**3) Publicar no Cursor**

Confirme o Publish do app `mapa-concreto` no chat do agente (botão Publish) para ter um link hospedado.

## Fluxo sugerido

1. `index.html` → obra **DEMO-MC-001**  
2. `planta.html` → “Região demo 25 m²” (ou desenhe) → confira **62,5% · 3,75 m³**  
3. `concretagem.html` → NF / Slump / comparativo de volumes  

“Restaurar demo” no painel limpa o `localStorage` desta chave.

## Limitações conscientes

- Sem autenticação, RLS, Storage ou relatório PDF real.  
- Sem IFC 3D / e-mail / SDK pago.  
- Geometria e volumes só do caso de demonstração / do que você desenhar × espessura informada.
