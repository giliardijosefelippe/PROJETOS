# Arquitetura — MapaConcreto (e plataforma compartilhada)

Documento vivo alinhado a [`/cursor/stores/.../docs/plano-fase-1.md`](../README.md) e à especificação de mapeamento de concreto. Complementa (não substitui) a Conferência de Projetos já existente neste repositório.

## 1. Visão

Uma aplicação Next.js multi-módulo:

| Módulo | Rotas | Domínio |
|--------|-------|---------|
| **Conferência** (legado Etapas A–D) | `/dashboard`, `/projects`, `/templates`, … | Checklists de pranchas estruturais |
| **MapaConcreto** (Fase 1) | `/mapas`, `/mapas/[obraId]`, … | Mapeamento de concretagens sobre plantas PDF |

Ambos compartilham: Auth Supabase, `organizations` / memberships, Storage privado, identidade visual Lunardeli, PDFKit e padrões de Server Actions.

## 2. Camadas

```
src/app/(app)/mapas/          # UI Server Components + páginas do fluxo
src/components/mapas/         # Visualizador PDF, ferramentas de desenho, fichas
src/actions/mapas/            # Mutações servidor (CRUD, upload, relatório)
src/lib/mapas/                # Domínio: geometria, quantitativos, tipos, PDF
supabase/migrations/00007_*   # Schema MapaConcreto + RLS
scripts/seed-mapas.mjs        # Dados de demonstração
```

### Regras

- Cliente browser: apenas **anon key** + RLS.
- `SUPABASE_SERVICE_ROLE_KEY`: seed / admin de servidor somente.
- Validar permissões no servidor além do RLS.
- UI e erros: **pt-BR**; símbolos de código: inglês.

## 3. Persistência e geometria

- Geometrias em **GeoJSON** (`jsonb`), coordenadas no referencial do desenho (pós-calibração), unidade explícita (m).
- Motor de área / interseção / união em TypeScript (`src/lib/mapas/geometry.ts`), testado em CI — PostGIS opcional em fases futuras.
- Arquivos originais em Storage (`library` / `evidence` / `reports`); hash SHA-256; originais imutáveis.
- Revisões de planta: novo registro; mapeamentos da revisão anterior **não** são reposicionados automaticamente.

## 4. Fluxo MVP (Fase 1)

```
Obra → Pavimento → Importar PDF → Calibrar escala
  → Desenhar região (retângulo | polígono | mão livre)
  → Cadastrar laje (área/espessura)
  → Calcular % e volume estimado
  → Concretagem + NF/caminhão + Slump + foto
  → Comparativo de volumes → Relatório PDF
```

### Volumes (nunca misturar rótulos)

| Métrica | Significado |
|---------|-------------|
| `volume_teorico` | Projeto / cadastro do elemento |
| `volume_estimado_mapeado` | Geometria região ∩ elemento × regra (ex.: espessura) |
| `volume_nf` | Soma documentada nas notas fiscais |
| `volume_alocado` / lançado | Alocação carga→região efetivamente registrada |
| `sobras` / devoluções / outros | Destinos explícitos — **não** = desperdício automático |

`diferenca_nf_teorico` é diferença entre métricas selecionadas; a UI **não** rotula como perda sem evidência.

## 5. Limitações conscientes (Fase 1–4 + polish)

- PDF: renderização + calibração; sem OCR/extração automática de elementos.
- Laje com espessura constante: cálculo automático auditável; pilares exigem altura.
- Vazios/ilhas: UI + `subtractVoids`; persistidos em `mc_mapped_regions.voids`.
- Vigas multi-etapa: `accumulateBeamStages` soma comprimentos (teto no eixo); com `startM`/`endM` aplica união 1D (`mergeAxisIntervals`) para evitar dupla contagem de trechos.
- DXF/DWG/IFC: Fases 2–3; `services/cad-convert`; sem SDK pago.
- Relatório: PDFKit com mapa esquemático das regiões (+ vazios); sem raster do PDF original.
- Migrations MapaConcreto: **00007 → 00013** (ver README).

## 6. Segurança e multi-tenant

- Quase toda tabela de negócio carrega `organization_id`.
- RLS por membership `active`.
- Uploads: MIME + tamanho no servidor; URLs assinadas de curta duração.
- `audit_events` append-only para operações críticas do módulo.

## 7. Testes mínimos

- Geometria: interseção, união, área, escala, exemplo 40 m² / 25 m² / 0,15 m → 62,5% / 3,75 m³.
- Quantitativos: NF ≠ desperdício; acumulado por união.
- Pilares sem altura → indeterminado.
- Isolamento org (matriz RLS / smoke).
- `npm run test`, `typecheck`, `lint`, `build`.
