# Lunardeli Engenharia — Conferência de Projetos + MapaConcreto

**Lunardeli Engenharia — Gestão e Qualidade de Projetos Estruturais**  
Nome curto na navegação: **Lunardeli | Qualidade**

Dois módulos no mesmo app Next.js + Supabase:

| Módulo | Rota | Função |
|--------|------|--------|
| **Conferência de Projetos** | `/projects`, `/templates`, … | Checklists, evidências, pendências e aprovação de pranchas |
| **MapaConcreto** (Fase 1) | `/mapas` | Mapear concretagens em PDF, volumes, NFs, Slump e relatório |

> **Estado:** Conferência Etapas A–D no código + **MapaConcreto Fase 1 (MVP)** em desenvolvimento neste branch. Persistência real via Supabase — **requer chaves e migrations**. Dados de seed do MapaConcreto são **demonstração**, não obra real.

Documentação:

- Produto conferência: [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md)
- Arquitetura (inclui MapaConcreto): [`docs/architecture.md`](./docs/architecture.md)
- Modelo de dados conferência: [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md)
- Spec MapaConcreto (Project store): `docs/especificacao-mapeamento-concreto.md` no Agent Store
- Plano Fase 1: `docs/plano-fase-1.md` no Agent Store

## Stack

| Camada | Tecnologia |
|--------|------------|
| App | Next.js 15 (App Router) + TypeScript + Tailwind CSS |
| Auth / DB / Storage | Supabase (Auth, Postgres, Storage privado) + RLS |
| PDF (relatórios) | PDFKit no servidor |
| PDF (visualizador MapaConcreto) | PDF.js + overlay SVG |
| Geometria | GeoJSON + motor TypeScript (`polygon-clipping`) |
| CAD (opcional) | Python `ezdxf` — `services/cad-convert` (fora do MVP de mapeamento) |
| Identidade | Tokens CSS em `src/app/globals.css` (vermelho `#E00024`) |

## Pré-requisitos

- Node.js 20+ e npm
- Projeto Supabase (Auth + Postgres + Storage)
- Variáveis conforme [`.env.example`](./.env.example)

## Configuração Supabase

Guia: [`docs/SETUP_SUPABASE.md`](./docs/SETUP_SUPABASE.md).

Execute as migrations na ordem, **incluindo**:

- `supabase/migrations/00001_init.sql` … `00006_dwg_support.sql` (conferência)
- `supabase/migrations/00007_mapaconcreto.sql` (**MapaConcreto**)

Buckets privados: `library`, `evidence`, `reports`.

## Como rodar

```bash
cp .env.example .env.local
# Preencha NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
# SUPABASE_SERVICE_ROLE_KEY (somente servidor)

npm install
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) → login → **MapaConcreto** na navegação.

### Seed

```bash
npm run seed          # org + usuários + templates conferência
npm run seed:mapas    # obra/planta/laje/região/NF/Slump de DEMONSTRAÇÃO
```

### Scripts

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Desenvolvimento |
| `npm run build` | Build |
| `npm run lint` | ESLint |
| `npm run test` | Testes (workflow + geometria MapaConcreto) |
| `npm run typecheck` | TypeScript |
| `npm run seed` | Seed conferência |
| `npm run seed:mapas` | Seed MapaConcreto (demo) |

## MapaConcreto — fluxo MVP

1. Criar obra (`/mapas/nova`)
2. Importar PDF da planta
3. Calibrar escala (dois pontos + distância real em m)
4. Desenhar região (retângulo / polígono / mão livre)
5. Cadastrar laje (ex.: 8×5 m, esp. 0,15 m)
6. Ver % e volume estimado (aceite: 40 m² ∩ 25 m² → **62,5% / 3,75 m³**)
7. Concretagem + NF/caminhão + alocação + Slump + foto
8. Comparativo teórico / mapeado / NF / alocado / sobras (**NF≠desperdício**)
9. Relatório PDF (`/api/mapas/report/[pourId]`)

### Regra de volumes

Distinguir sempre: **teórico** · **estimado mapeado** · **NF** · **lançado/alocado** · **sobras/devoluções/outros**.  
A diferença NF − teórico **não** é classificada automaticamente como desperdício.

### Limitações (Fase 1–2)

- PDF sem extração automática de elementos; calibração manual.
- Cálculo automático confiável para **lajes de espessura constante**; pilares exigem altura ou ficam indeterminados.
- **DXF (Fase 2):** importa layers/geometrias; **não** inventa lajes/pilares — use CSV/manual. Fixture: `fixtures/mapas/demo-laje-40m2.dxf`.
- **Booleanas / regras (Fase 2B):** vazios, união acumulada, conflitos sem dupla contagem; vigas (seção×comp. executado), pilares (altura) e fundações simples com memória de cálculo.
- **Revisões assistidas (Fase 2C):** nova revisão **não** move mapeamentos; `/reconciliar` classifica órfãs/deslocadas e registra aceitar/reassociar/arquivar com auditoria.
- DWG/IFC e SDK pagos **fora** deste incremento (alternativa: exportar DXF/PDF/CSV).
- Relatório PDF consolida quantitativos; mapa vetorial completo da planta é evolução.

### DXF — como testar

```bash
npm run test   # inclui parser DXF (laje demo 40 m²) + reconcile
# Migrations 00008–00010
npm run dev    # Obra → Importar DXF → layers no visualizador
# Planta → Criar revisão → /reconciliar → Aceitar / Reassociar / Arquivar

# Opcional (ezdxf):
cd services/cad-convert && uvicorn app.main:app --port 8091
# POST /parse com multipart file
```

## Critérios de aceite — MapaConcreto Fase 1

Ver checklist em `docs/plano-fase-1.md` (Agent Store) e spec §12. Validação mínima local:

```bash
npm run test
npm run typecheck
npm run lint
```

Com Supabase: migration `00007` → `seed` → `seed:mapas` → fluxo em `/mapas`.

## O que depende de configuração externa

- Chaves Supabase e Auth redirects
- Buckets + policies
- Seed / usuários
- Nenhuma SDK paga obrigatória para o MVP
