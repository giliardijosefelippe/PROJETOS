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

## Como abrir

**Opção A — duplo clique**

1. Abra a pasta `demo-mapaconcreto` no Finder/Explorer.  
2. Duplo clique em `index.html`.

**Opção B — servidor local (recomendado)**

```bash
cd /caminho/para/demo-mapaconcreto
python3 -m http.server 8765
```

Abra http://127.0.0.1:8765/

## Fluxo sugerido

1. `index.html` → obra **DEMO-MC-001**  
2. `planta.html` → “Região demo 25 m²” (ou desenhe) → confira **62,5% · 3,75 m³**  
3. `concretagem.html` → NF / Slump / comparativo de volumes  

“Restaurar demo” no painel limpa o `localStorage` desta chave.

## Limitações conscientes

- Sem autenticação, RLS, Storage ou relatório PDF real.  
- Sem IFC 3D / e-mail / SDK pago.  
- Geometria e volumes só do caso de demonstração / do que você desenhar × espessura informada.
