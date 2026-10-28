# Roadmap — Etapas A–D

Incrementos concretos. Não misturar escopo D no meio do MVP sem pedido explícito.

## Etapa A — Planejamento ✅

**Objetivo:** arquitetura, contratos e docs antes de app.

| Incremento | Entrega |
|------------|---------|
| A1 | Inspeção do repo e alinhamento ao prompt mestre |
| A2 | `README.md` — stack, run local, env, decisões externas |
| A3 | `AGENTS.md` — convenções para agentes |
| A4 | `docs/PRODUCT_SPEC.md` — papéis, fluxos, telas, aceite MVP |
| A5 | `docs/DATA_MODEL.md` — entidades, índices, imutabilidade, RLS esboço |
| A6 | `docs/ROADMAP.md` — este arquivo |
| A7 | `.env.example` — variáveis sem segredos |
| A8 | PR contra `main` com decisões de arquitetura |

**Critério de saída:** PR revisável; Etapa B pode iniciar sem ambiguidade de stack/modelo.

---

## Etapa B — MVP funcional

**Objetivo:** software utilizável com persistência real (Supabase), não mock-only.

### B1 — Bootstrap do app
- Scaffold Next.js App Router + TS + Tailwind + lint/test baseline.
- Clientes Supabase (browser anon + server).
- Layout pt-BR, shell autenticado mínimo.
- Migrations iniciais das tabelas core (`organizations` … memberships, profiles).

### B2 — Auth e papéis
- Login / logout / sessão (Supabase Auth).
- `users_profiles` + `organization_memberships` + guardas por papel.
- Bloqueio de auto-aprovação (regra de domínio no servidor).
- Seed de usuários demo por papel (documentado; sem senhas no git).

### B3 — Projetos, pranchas, revisões
- CRUD projeto; tipos de prancha; prancha; revisão; upload de arquivo (bucket `evidence` ou dedicado).
- Estados de workflow básicos na revisão.
- Listagens com paginação.

### B4 — Biblioteca de templates
- CRUD template + seções + itens (campos do spec).
- Upload mídia (foto destaque, exemplos, vídeo) no bucket `library`.
- Publicar versão (v1); rascunho / desativar / duplicar.
- Seed Forma / Vigas / Lajes (produção + conferência) editável.

### B5 — Execução de checklist
- Criar `checklist_run` com snapshot na revisão.
- UI 3 colunas (desktop) / empilhada (mobile).
- Respostas + regras N/A e NC; evidências; autosave.
- Encaminhar produção → aguardando conferência.

### B6 — Pendências e reconferência
- Criar `issues` a partir de NC; timeline `issue_events`.
- Fluxo correção → aguardando reconferência → resolvida/reaberta.
- Atribuição e comentários.

### B7 — Aprovação interna
- Painel de bloqueios (críticos/bloqueantes).
- Exceção formal registrada (não vira conforme).
- `approvals` + revisão imutável ao aprovar.
- Impedir aprovador = `production_owner`.

### B8 — Relatórios PDF
- Geração no servidor dos 4 tipos mínimos (ou subset: conferência + pendências primeiro, depois os demais).
- Persistência em `report_exports` + bucket `reports`.
- Cabeçalho/logo da org se configurados.

### B9 — Aceite e higiene
- Percorrer critérios de aceite do PRODUCT_SPEC.
- README atualizado com migrate/seed reais.
- Testes do fluxo crítico + build CI verde.

**Dependências externas (bloqueiam “completo” em produção, não o código):**
projeto Supabase, buckets, keys em `.env.local`, Auth redirects.

**Critério de saída:** aceite §8 do PRODUCT_SPEC demonstrável em ambiente configurado.

---

## Etapa C — Robustez

| Incremento | Foco |
|------------|------|
| C1 | Versionamento imutável endurecido (triggers/tests); comparação metadata v1/v2 |
| C2 | `audit_events` em mutações relevantes; retenção documentada (LGPD) |
| C3 | Suite de testes RLS (isolamento org + papéis) |
| C4 | Testes aprovação / reconferência / exceção formal |
| C5 | Validações de upload (MIME/tamanho) e mensagens de erro consistentes |
| C6 | Dashboard de indicadores (conformidade + cobertura separadas) |
| C7 | Filtros avançados, reordenação de itens, navegação fluida no checklist |
| C8 | Condicionais de itens além do mínimo B; performance em listas longas |

**Critério de saída:** confiança operacional para uso interno real; regressões cobertas.

---

## Etapa D — Evolução (não bloqueia MVP)

Priorizar sob demanda:

1. Marcações coordenadas sobre PDF.  
2. Comparação visual/estruturada entre revisões.  
3. Importação de itens por planilha.  
4. Revisão colaborativa (presença / locks).  
5. Exportação Excel.  
6. Integração PRUMO (contrato a definir).  
7. Visualização DWG/DXF via Python (ezdxf + ODA opcional) — **implementado**; IFC ainda stub.  
8. Apoio de IA para localizar inconsistências — **sempre** com revisão humana; sem interpretação estrutural automática “já validada”.

Cada item D = PR próprio com spec curta antes de codificar.

---

## Ordem sugerida na prática

```
A (docs) → B1–B2 (app+auth) → B3–B4 (dados+templates)
  → B5–B7 (fluxo) → B8–B9 (PDF+aceite) → C* → D sob demanda
```

## Rastreio de status

| Etapa | Status |
|-------|--------|
| A | Concluída |
| B | MVP no código (requer Supabase configurado para E2E) |
| C | Robustez no código (triggers, testes, indicadores, filtros) |
| D | Fundações no código (compare, CSV, anotações, CAD Python, stubs PRUMO/IFC/IA) |
