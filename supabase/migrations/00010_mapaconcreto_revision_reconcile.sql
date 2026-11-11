-- MapaConcreto Fase 2 — reconciliação assistida de revisões de planta
-- Regra: nunca reposicionar mapeamentos silenciosamente.

alter table mc_drawing_revisions
  add column if not exists supersedes_revision_id uuid
    references mc_drawing_revisions(id) on delete set null;

comment on column mc_drawing_revisions.supersedes_revision_id is
  'Revisão anterior desta planta; mapeamentos antigos permanecem na origem até reconciliação explícita.';

alter table mc_mapped_regions
  add column if not exists archived_at timestamptz;

alter table mc_mapped_regions
  add column if not exists archived_reason text;

alter table mc_mapped_regions
  add column if not exists copied_from_region_id uuid
    references mc_mapped_regions(id) on delete set null;

do $$ begin
  create type mc_reconcile_decision as enum (
    'copy_to_target',
    'reassociate',
    'archive',
    'dismiss'
  );
exception when duplicate_object then null; end $$;

create table if not exists mc_region_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  source_revision_id uuid not null references mc_drawing_revisions(id) on delete cascade,
  target_revision_id uuid not null references mc_drawing_revisions(id) on delete cascade,
  source_region_id uuid references mc_mapped_regions(id) on delete set null,
  target_region_id uuid references mc_mapped_regions(id) on delete set null,
  decision mc_reconcile_decision not null,
  proposal_status text,
  notes text,
  payload jsonb not null default '{}'::jsonb,
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists mc_reconcile_pair_idx
  on mc_region_reconciliations(source_revision_id, target_revision_id);

alter table mc_region_reconciliations enable row level security;

drop policy if exists mc_region_reconciliations_select on mc_region_reconciliations;
drop policy if exists mc_region_reconciliations_insert on mc_region_reconciliations;
drop policy if exists mc_region_reconciliations_update on mc_region_reconciliations;
drop policy if exists mc_region_reconciliations_delete on mc_region_reconciliations;

create policy mc_region_reconciliations_select on mc_region_reconciliations
  for select using (mc_is_org_member(organization_id));
create policy mc_region_reconciliations_insert on mc_region_reconciliations
  for insert with check (mc_is_org_member(organization_id));
create policy mc_region_reconciliations_update on mc_region_reconciliations
  for update using (mc_is_org_member(organization_id));
create policy mc_region_reconciliations_delete on mc_region_reconciliations
  for delete using (mc_is_org_member(organization_id));
