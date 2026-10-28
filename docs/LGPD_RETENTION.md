# Retenção e auditoria (LGPD) — Etapa C

## Princípios

- Autoria sempre vinculada a usuário autenticado (`actor_id` / `answered_by` / `decided_by`).
- `audit_events` e `issue_events` são **append-only** (triggers na migration `00004_immutability.sql`).
- Conferências aprovadas e runs com snapshot **não** são excluídos fisicamente.
- Soft-delete / arquivamento preferidos a hard-delete em entidades de negócio.

## O que é auditado (MVP+)

| Ação | `action` sugerido |
|------|-------------------|
| Criar projeto | `project.create` |
| Mudança de workflow | `revision.workflow` |
| Publicar template | `template.publish` |
| Submeter produção | `production.submit` |
| Aprovar / reprovar | `revision.approve` / via `approvals` |
| Atualizar logo | `org.logo_update` |
| Devolver pendências | `revision.return_pendencias` |

Novas mutações relevantes devem chamar `writeAudit` (`src/lib/audit/log.ts`).

## Retenção sugerida (configurável pela empresa)

| Dados | Retenção mínima sugerida | Observação |
|-------|--------------------------|------------|
| `audit_events` | 5 anos | Alinhar a política interna / contratos |
| Runs + respostas + evidências de revisões aprovadas | Vida do projeto + 5 anos | Imutáveis após aprovação |
| Issues / issue_events | Igual às revisões vinculadas | Histórico completo |
| Storage (evidence/reports) | Espelhar metadados | Paths por `organization_id` |
| Contas / memberships desativadas | Conforme RH/TI | `status = disabled`, sem hard-delete imediato |

Valores acima são **defaults documentados**, não prescritos legalmente — a organização deve validar com assessoria jurídica.

## Direitos do titular

- Acesso e correção de dados cadastrais via perfil / admin.
- Exportação de relatórios PDF já disponível por revisão.
- Exclusão definitiva de PII: processo manual com service role + registro de solicitação em `audit_events` (Etapa D pode automatizar).

## Isolamento

RLS por `organization_id` + membership `active`. Service role apenas no servidor (seed, jobs).
