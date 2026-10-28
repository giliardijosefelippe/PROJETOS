-- Smoke tests RLS — executar no SQL Editor APÓS migrations + seed,
-- com dois usuários de orgs distintas (service role para setup; anon JWT para asserts).
-- Este arquivo documenta o procedimento; não roda no `npm test` sem Postgres.

-- Expectativa:
-- 1) Usuário da org A NÃO vê projects da org B
-- 2) Papel consulta não consegue INSERT em checklist_templates
-- 3) UPDATE em issue_events / audit_events falha (append-only trigger)
-- 4) UPDATE em checklist_items de versão published falha
-- 5) INSERT approvals com decided_by = production_owner falha

-- Exemplo (adaptar UUIDs após seed):
-- set request.jwt.claim.sub = '<user_org_a>';
-- select count(*) from projects; -- só org A
--
-- begin;
--   update issue_events set event_type = 'hack' where false; -- no-op
--   -- tentar update real deve raise
-- rollback;
