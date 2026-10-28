-- Lunardeli Engenharia — Conferência de Projetos
-- Etapa B: schema inicial + RLS
-- Aplicar no SQL Editor do Supabase ou via CLI: supabase db push

-- Extensions
create extension if not exists "pgcrypto";

-- Enums
do $$ begin
  create type membership_role as enum ('admin', 'coordenador', 'desenhista', 'conferente', 'consulta');
exception when duplicate_object then null; end $$;

do $$ begin
  create type membership_status as enum ('active', 'invited', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type project_status as enum ('active', 'archived');
exception when duplicate_object then null; end $$;

do $$ begin
  create type workflow_status as enum (
    'rascunho',
    'em_producao',
    'aguardando_conferencia',
    'em_conferencia',
    'com_pendencias',
    'em_correcao',
    'aguardando_reconferencia',
    'aprovado_emissao',
    'cancelado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type activity_kind as enum ('producao', 'conferencia');
exception when duplicate_object then null; end $$;

do $$ begin
  create type template_status as enum ('draft', 'published', 'disabled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type template_version_status as enum ('draft', 'published', 'superseded');
exception when duplicate_object then null; end $$;

do $$ begin
  create type response_status as enum (
    'nao_iniciado',
    'conforme',
    'nao_conforme',
    'nao_aplicavel',
    'pendente_verificacao'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type priority_level as enum ('baixa', 'media', 'alta', 'critica');
exception when duplicate_object then null; end $$;

do $$ begin
  create type media_kind as enum ('highlight', 'example_ok', 'example_bad', 'video', 'attachment');
exception when duplicate_object then null; end $$;

do $$ begin
  create type issue_status as enum (
    'aberta',
    'em_correcao',
    'aguardando_reconferencia',
    'resolvida',
    'reaberta'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_decision as enum ('aprovado_emissao', 'reprovado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type report_type as enum ('producao', 'conferencia', 'pendencias', 'resumo');
exception when duplicate_object then null; end $$;

do $$ begin
  create type run_status as enum ('em_andamento', 'concluido', 'cancelado');
exception when duplicate_object then null; end $$;

do $$ begin
  create type standard_sheet_status as enum ('draft', 'published', 'disabled');
exception when duplicate_object then null; end $$;

-- Helper: updated_at trigger
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Membership helper for RLS
create or replace function public.is_org_member(p_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

create or replace function public.org_role(p_org uuid)
returns membership_role
language sql
stable
security definer
set search_path = public
as $$
  select m.role from public.organization_memberships m
  where m.organization_id = p_org
    and m.user_id = auth.uid()
    and m.status = 'active'
  limit 1;
$$;

create or replace function public.has_org_role(p_org uuid, roles membership_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organization_memberships m
    where m.organization_id = p_org
      and m.user_id = auth.uid()
      and m.status = 'active'
      and m.role = any(roles)
  );
$$;

-- Organizations
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  logo_storage_path text,
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- Profiles
create table if not exists public.users_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger users_profiles_updated_at
  before update on public.users_profiles
  for each row execute function public.set_updated_at();

-- Memberships
create table if not exists public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role membership_role not null default 'consulta',
  status membership_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index if not exists idx_memberships_user on public.organization_memberships(user_id);
create index if not exists idx_memberships_org_role on public.organization_memberships(organization_id, role);

create trigger organization_memberships_updated_at
  before update on public.organization_memberships
  for each row execute function public.set_updated_at();

-- Auto profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.users_profiles (user_id, full_name, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), ''),
    coalesce(new.email, '')
  )
  on conflict (user_id) do update
    set email = excluded.email,
        full_name = coalesce(nullif(excluded.full_name, ''), users_profiles.full_name),
        updated_at = now();
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Projects
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  name text not null,
  description text,
  status project_status not null default 'active',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists idx_projects_org_status on public.projects(organization_id, status);

create trigger projects_updated_at
  before update on public.projects
  for each row execute function public.set_updated_at();

-- Structures (torre/bloco)
create table if not exists public.structures (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  kind text,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger structures_updated_at
  before update on public.structures
  for each row execute function public.set_updated_at();

-- Drawing types
create table if not exists public.drawing_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  code text not null,
  name text not null,
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create trigger drawing_types_updated_at
  before update on public.drawing_types
  for each row execute function public.set_updated_at();

-- Drawings
create table if not exists public.drawings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete cascade,
  structure_id uuid references public.structures(id) on delete set null,
  level_label text,
  drawing_type_id uuid not null references public.drawing_types(id) on delete restrict,
  number text not null,
  title text not null,
  discipline text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, number)
);

create index if not exists idx_drawings_project on public.drawings(project_id);
create index if not exists idx_drawings_org_type on public.drawings(organization_id, drawing_type_id);

create trigger drawings_updated_at
  before update on public.drawings
  for each row execute function public.set_updated_at();

-- Revisions
create table if not exists public.drawing_revisions (
  id uuid primary key default gen_random_uuid(),
  drawing_id uuid not null references public.drawings(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  revision_code text not null,
  revision_date date,
  workflow_status workflow_status not null default 'rascunho',
  production_owner_id uuid references auth.users(id),
  reviewer_id uuid references auth.users(id),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancel_reason text,
  immutable boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (drawing_id, revision_code),
  constraint chk_no_self_approval check (approved_by is null or production_owner_id is null or approved_by <> production_owner_id)
);

create index if not exists idx_revisions_drawing on public.drawing_revisions(drawing_id);
create index if not exists idx_revisions_org_status on public.drawing_revisions(organization_id, workflow_status);

create trigger drawing_revisions_updated_at
  before update on public.drawing_revisions
  for each row execute function public.set_updated_at();

-- Drawing files
create table if not exists public.drawing_files (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.drawing_revisions(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Standard sheets & parameters
create table if not exists public.standard_sheets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  title text not null,
  revision_label text,
  description text,
  drawing_type_id uuid references public.drawing_types(id) on delete set null,
  storage_path text,
  classification text,
  status standard_sheet_status not null default 'draft',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger standard_sheets_updated_at
  before update on public.standard_sheets
  for each row execute function public.set_updated_at();

create table if not exists public.standard_parameters (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null,
  label text not null,
  value jsonb not null default '{}'::jsonb,
  category text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key)
);

create trigger standard_parameters_updated_at
  before update on public.standard_parameters
  for each row execute function public.set_updated_at();

-- Checklist templates
create table if not exists public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  drawing_type_id uuid not null references public.drawing_types(id) on delete restrict,
  activity_kind activity_kind not null,
  discipline text,
  status template_status not null default 'draft',
  current_version_id uuid,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_templates_org_type_kind
  on public.checklist_templates(organization_id, drawing_type_id, activity_kind);

create trigger checklist_templates_updated_at
  before update on public.checklist_templates
  for each row execute function public.set_updated_at();

create table if not exists public.checklist_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.checklist_templates(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  version_number int not null,
  status template_version_status not null default 'draft',
  published_at timestamptz,
  published_by uuid references auth.users(id),
  snapshot_note text,
  content_hash text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (template_id, version_number)
);

create index if not exists idx_template_versions_status
  on public.checklist_template_versions(template_id, status);

create trigger checklist_template_versions_updated_at
  before update on public.checklist_template_versions
  for each row execute function public.set_updated_at();

alter table public.checklist_templates
  drop constraint if exists checklist_templates_current_version_id_fkey;
alter table public.checklist_templates
  add constraint checklist_templates_current_version_id_fkey
  foreign key (current_version_id) references public.checklist_template_versions(id) on delete set null;

create table if not exists public.checklist_sections (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.checklist_template_versions(id) on delete cascade,
  parent_section_id uuid references public.checklist_sections(id) on delete set null,
  title text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  template_version_id uuid not null references public.checklist_template_versions(id) on delete cascade,
  section_id uuid not null references public.checklist_sections(id) on delete cascade,
  code text not null,
  title text not null,
  objective text,
  steps jsonb not null default '[]'::jsonb,
  verifiable_parameter text,
  acceptance_criteria text,
  technical_reference jsonb,
  priority priority_level not null default 'media',
  is_blocking boolean not null default false,
  instructions text,
  conditional_rules jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger checklist_items_updated_at
  before update on public.checklist_items
  for each row execute function public.set_updated_at();

create table if not exists public.checklist_item_media (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.checklist_items(id) on delete cascade,
  kind media_kind not null,
  storage_path text,
  external_url text,
  caption text,
  cover_path text,
  duration_seconds int,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Runs
create table if not exists public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  revision_id uuid not null references public.drawing_revisions(id) on delete restrict,
  template_version_id uuid not null references public.checklist_template_versions(id) on delete restrict,
  activity_kind activity_kind not null,
  status run_status not null default 'em_andamento',
  assignee_id uuid references auth.users(id),
  template_snapshot jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_runs_revision_kind on public.checklist_runs(revision_id, activity_kind);
create index if not exists idx_runs_org_status on public.checklist_runs(organization_id, status);

create trigger checklist_runs_updated_at
  before update on public.checklist_runs
  for each row execute function public.set_updated_at();

create table if not exists public.checklist_run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.checklist_runs(id) on delete cascade,
  source_item_id uuid,
  section_title text,
  code text not null,
  title text not null,
  objective text,
  steps jsonb not null default '[]'::jsonb,
  verifiable_parameter text,
  acceptance_criteria text,
  technical_reference jsonb,
  priority priority_level not null default 'media',
  is_blocking boolean not null default false,
  instructions text,
  media_snapshot jsonb not null default '[]'::jsonb,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.checklist_item_responses (
  id uuid primary key default gen_random_uuid(),
  run_item_id uuid not null unique references public.checklist_run_items(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  status response_status not null default 'nao_iniciado',
  comment text,
  answered_by uuid references auth.users(id),
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger checklist_item_responses_updated_at
  before update on public.checklist_item_responses
  for each row execute function public.set_updated_at();

create table if not exists public.response_evidence (
  id uuid primary key default gen_random_uuid(),
  response_id uuid not null references public.checklist_item_responses(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null default 0,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Issues
create table if not exists public.issues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null,
  title text not null,
  description text,
  run_item_id uuid references public.checklist_run_items(id) on delete set null,
  response_id uuid references public.checklist_item_responses(id) on delete set null,
  revision_id uuid not null references public.drawing_revisions(id) on delete restrict,
  project_id uuid not null references public.projects(id) on delete restrict,
  priority priority_level not null default 'media',
  assignee_id uuid references auth.users(id),
  due_date date,
  status issue_status not null default 'aberta',
  opened_by uuid references auth.users(id),
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index if not exists idx_issues_org_status on public.issues(organization_id, status);
create index if not exists idx_issues_revision on public.issues(revision_id);
create index if not exists idx_issues_assignee on public.issues(assignee_id);

create trigger issues_updated_at
  before update on public.issues
  for each row execute function public.set_updated_at();

create table if not exists public.issue_events (
  id uuid primary key default gen_random_uuid(),
  issue_id uuid not null references public.issues(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_issue_events_issue on public.issue_events(issue_id, created_at);

-- Approvals
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  revision_id uuid not null references public.drawing_revisions(id) on delete restrict,
  decision approval_decision not null,
  decided_by uuid not null references auth.users(id),
  decided_at timestamptz not null default now(),
  notes text,
  exception_records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_approvals_revision on public.approvals(revision_id);

-- Audit & reports
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid,
  actor_id uuid,
  action text not null,
  entity_type text,
  entity_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_org_created on public.audit_events(organization_id, created_at desc);
create index if not exists idx_audit_entity on public.audit_events(entity_type, entity_id);

create table if not exists public.report_exports (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  report_type report_type not null,
  filters jsonb not null default '{}'::jsonb,
  storage_path text,
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  revision_id uuid references public.drawing_revisions(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_report_exports_org on public.report_exports(organization_id, generated_at desc);

-- Issue code sequence helper
create or replace function public.next_issue_code(p_org uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  select count(*) + 1 into n from public.issues where organization_id = p_org;
  return 'NC-' || lpad(n::text, 4, '0');
end;
$$;
