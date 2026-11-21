# Lunardeli Engenharia — Conferência de Projetos + MapaConcreto

**Lunardeli Engenharia — Gestão e Qualidade de Projetos Estruturais**  
Nome curto na navegação: **Lunardeli | Qualidade**

Dois módulos no mesmo app Next.js + Supabase:

| Módulo | Rota | Função |
|--------|------|--------|
| **Conferência de Projetos** | `/projects`, `/templates`, … | Checklists, evidências, pendências e aprovação de pranchas |
| **MapaConcreto** | `/mapas` | Mapear concretagens em PDF, volumes, NFs, Slump, gestão e relatório |

> **Estado:** Conferência Etapas A–D + **MapaConcreto pronto para merge** (tip PR **#20** closeout). Persistência via Supabase — **migrations 00007–00014**. Seed = **demonstração**. Checklist §12: `/mapas/aceitacao`. Guia merge/smoke: [`docs/MAPACONCRETO_MERGE.md`](./docs/MAPACONCRETO_MERGE.md).

Documentação:

- Produto conferência: [`docs/PRODUCT_SPEC.md`](./docs/PRODUCT_SPEC.md)
- Arquitetura (inclui MapaConcreto): [`docs/architecture.md`](./docs/architecture.md)
- Modelo de dados conferência: [`docs/DATA_MODEL.md`](./docs/DATA_MODEL.md)
- **Merge + smoke MapaConcreto:** [`docs/MAPACONCRETO_MERGE.md`](./docs/MAPACONCRETO_MERGE.md)
- Spec / guia expandido (Project store): `docs/especificacao-mapeamento-concreto.md`, `docs/guia-merge-smoke.md`

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

Execute as migrations **na ordem** (não pule):

| Ordem | Arquivo | Conteúdo |
|-------|---------|----------|
| 00001–00005 | `00001_init` … | Conferência (orgs, checklists, auditoria) |
| 00006 | `00006_dwg_support.sql` | MIME/preview CAD (conferência) |
| **00007** | `00007_mapaconcreto.sql` | **MapaConcreto** base (obras, plantas, regiões, NFs) |
| 00008 | `00008_mapaconcreto_dxf.sql` | DXF layers/entities |
| 00009 | `00009_mapaconcreto_rules.sql` | Viga/calc_memory/voids |
| 00010 | `00010_mapaconcreto_revision_reconcile.sql` | Revisões assistidas |
| 00011 | `00011_mapaconcreto_dwg_ifc.sql` | DWG intermediário + IFC |
| 00012 | `00012_mapaconcreto_gestao.sql` | Ocorrências, notificações, status |
| 00013 | `00013_mapaconcreto_polish.sql` | Comp. executado por etapa (viga) |
| 00014 | `00014_mapaconcreto_seed_idempotent.sql` | Unique buildings/floors p/ seed idempotente |

**Merge (ordem fixa):** `#11`→`#12`→`#14`→`#15`→`#16`→`#17`→`#18`→`#19`→`#20` — detalhes em [`docs/MAPACONCRETO_MERGE.md`](./docs/MAPACONCRETO_MERGE.md).

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
npm run seed              # org + usuários + templates conferência
npm run seed:mapas        # obra/planta/laje/região/NF/Slump (idempotente)
npm run seed:mapas:check  # offline — gera PDF demo + valida plano (sem secrets)
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
| `npm run seed:mapas` | Seed MapaConcreto (demo, idempotente) |
| `npm run seed:mapas:check` | Offline — PDF demo + plano §12 |
| `npm run smoke:mapas` | Offline — test + typecheck + check + checklist manual |

## MapaConcreto — merge e smoke (produção/local)

```bash
npm run smoke:mapas          # offline, sem secrets
# Com Supabase: migrations 00001–00014 → seed → seed:mapas → npm run dev
# Browser: login → /mapas → PDF → escala → região → laje → concretagem → relatório
```

Ordem de merge e troubleshooting: [`docs/MAPACONCRETO_MERGE.md`](./docs/MAPACONCRETO_MERGE.md).

## MapaConcreto — fluxo ponta a ponta (demo)

Com Supabase configurado e migrations **00007–00014**:

```bash
npm run seed
npm run seed:mapas
npm run dev
```

1. Abrir `/mapas` → obra **DEMO-MC-001** (badge Demonstração)
2. Planta **R00** já calibrada (barra 5 m); regiões A (25 m² + vazio demo) e B (sobreposição → união 40 m²)
3. Laje **LJ-DEMO-40** — aceite **40∩25 → 62,5% / 3,75 m³** (interseção bruta documentada no seed)
4. Concretagens **C-DEMO-01/02**, NFs **NF-DEMO-1001/1002** (N:N), Slump, viga multi-etapa, pilar sem altura (indeterminado)
5. Painel · Rastreio · Campo · Auditoria · Relatório PDF · `/mapas/aceitacao` (§12)

Fluxo manual (sem seed): `/mapas/nova` → PDF → calibrar → região → laje → concretagem → NF/Slump → relatório.

### Regra de volumes

Distinguir sempre: **teórico** · **estimado mapeado** · **NF** · **lançado/alocado** · **sobras/devoluções/outros**.  
A diferença NF − teórico **não** é classificada automaticamente como desperdício.

### Limitações conscientes

- PDF sem extração automática de elementos; calibração manual.
- Lajes com espessura constante: cálculo automático; pilares exigem altura ou ficam indeterminados.
- **Vazios/ilhas:** toolbar + motor booleano; relatório desenha vazios no esquema.
- **Vigas multi-etapa:** soma de comprimentos por etapa (teto no eixo); com intervalos `startM`/`endM` aplica união 1D.
- **DXF / DWG / IFC:** sem SDK pago; DWG real exige ODA + `CAD_CONVERT_URL`; IFC sem viewer 3D.
- **Reconciliação:** assistida + overlay; matching por geometria e nome normalizado; sem auto-reposicionar.
- Relatório PDF: **raster da página do PDF** (quando disponível) + esquema das regiões + quantitativos.
- Gestão: avisos in-app (sem e-mail/push pago). IFC 3D e e-mail/push pagos: fora de escopo.

### Como testar (MapaConcreto)

```bash
npm run smoke:mapas
# Com Supabase: migrations 00007–00014 → seed → seed:mapas → npm run dev
# /mapas → DEMO-MC-001 · /mapas/aceitacao · painel · rastreio · relatório

# CAD opcional (DWG):
cd services/cad-convert && pip install -r requirements.txt
# ODA File Converter no PATH do host
uvicorn app.main:app --port 8091
# CAD_CONVERT_URL=http://127.0.0.1:8091
```

## Critérios de aceite — MapaConcreto (§12)

UI: `/mapas/aceitacao`. Spec no Agent Store. Validação mínima: `npm run smoke:mapas`.

Com Supabase: migrations **00007–00014** → `seed` → `seed:mapas` → fluxo em `/mapas`.

## O que depende de configuração externa

- Chaves Supabase e Auth redirects
- Buckets + policies + migrations **00001–00014**
- Seed / usuários
- ODA File Converter **somente** se for importar DWG real (alternativa local: DXF/PDF)
- Nenhuma SDK paga obrigatória — **nada bloqueante de produto além do ambiente**
