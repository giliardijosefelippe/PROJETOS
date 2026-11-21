# MapaConcreto — merge, migrations e smoke

Guia operacional para colocar o tip da stack em `main` / local. Spec no Agent Store; espelho expandido: `docs/guia-merge-smoke.md` no Project store.

**Status:** código da spec fechado (PR **#20** closeout). Pronto para merge quando a stack for incorporada e o Supabase do ambiente estiver configurado.

## Ordem de merge (não pular)

1. [#11](https://github.com/giliardijosefelippe/PROJETOS/pull/11) Fase 1 → `main`  
2. [#12](https://github.com/giliardijosefelippe/PROJETOS/pull/12) DXF  
3. [#14](https://github.com/giliardijosefelippe/PROJETOS/pull/14) Booleanas / vazios / regras  
4. [#15](https://github.com/giliardijosefelippe/PROJETOS/pull/15) Revisões  
5. [#16](https://github.com/giliardijosefelippe/PROJETOS/pull/16) DWG/IFC  
6. [#17](https://github.com/giliardijosefelippe/PROJETOS/pull/17) Gestão  
7. [#18](https://github.com/giliardijosefelippe/PROJETOS/pull/18) Polish  
8. [#19](https://github.com/giliardijosefelippe/PROJETOS/pull/19) Hardening  
9. [#20](https://github.com/giliardijosefelippe/PROJETOS/pull/20) Closeout (seed idempotente + raster relatório)  

(Não há PR #13 nesta stack.)

## Migrations

Aplicar **00001 → 00014** na ordem (`supabase/migrations/`). MapaConcreto começa em **00007**; **00014** habilita seed idempotente (unique buildings/floors).

Buckets privados: `library`, `evidence`, `reports`.

## Smoke

```bash
# Offline (sem secrets)
npm run smoke:mapas

# Com Supabase
# 1) .env.local preenchido  2) migrations 00001–00014
npm run seed && npm run seed:mapas
npm run dev
```

Browser: login → `/mapas` → PDF → calibrar escala → região → laje → concretagem → relatório (`/api/mapas/report/[pourId]`).  
Com seed: obra **DEMO-MC-001** · aceite **62,5% / 3,75 m³** · `/mapas/aceitacao`.

## Troubleshooting (resumo)

| Problema | Ação |
|----------|------|
| Sem secrets | Preencher `.env.local`; offline: `smoke:mapas` / `seed:mapas:check` |
| Tabela `mc_*` inexistente | Rodar migrations até **00014** |
| Upload falha | Buckets + policies Storage |
| DWG / ODA | Opcional — use DXF ou PDF |
| Relatório sem raster | PDF no Storage; esquema ainda funciona |

**Bloqueante além do ambiente?** Não — sem SDK pago obrigatório. Fora de escopo: IFC 3D, e-mail/push pagos.

## Demo HTML estático (opcional)

Pasta [`docs/demo-mapaconcreto/`](./demo-mapaconcreto/) — painel / planta / concretagem sem Next nem Supabase (`localStorage`). Útil para teste visual rápido; **não** é o app de produção.

```bash
cd docs/demo-mapaconcreto && python3 -m http.server 8765
```
