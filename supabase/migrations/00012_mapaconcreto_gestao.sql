-- MapaConcreto Fase 4 — gestão avançada (ocorrências, notificações, histórico de status)
-- Sem serviços pagos de notificação.

do $$ begin
  create type mc_occurrence_severity as enum (
    'baixa', 'media', 'alta', 'critica'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type mc_occurrence_status as enum (
    'aberta', 'em_andamento', 'aguardando', 'resolvida', 'cancelada'
  );
exception when duplicate_object then null; end $$;

create table if not exists mc_site_occurrences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  site_id uuid not null references mc_sites(id) on delete cascade,
  floor_id uuid references mc_floors(id) on delete set null,
  pour_id uuid references mc_concrete_pours(id) on delete set null,
  region_id uuid references mc_mapped_regions(id) on delete set null,
  title text not null,
  description text,
  severity mc_occurrence_severity not null default 'media',
  status mc_occurrence_status not null default 'aberta',
  corrective_action text,
  responsible_name text,
  due_date date,
  resolved_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists mc_occ_site_idx on mc_site_occurrences(site_id, status);
create index if not exists mc_occ_org_idx on mc_site_occurrences(organization_id, created_at desc);

create table if not exists mc_pour_status_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  pour_id uuid not null references mc_concrete_pours(id) on delete cascade,
  from_status mc_pour_status,
  to_status mc_pour_status not null,
  justification text not null,
  structural_approval_claimed boolean not null default false,
  decided_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists mc_pour_status_hist_idx
  on mc_pour_status_history(pour_id, created_at desc);

create table if not exists mc_notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  site_id uuid references mc_sites(id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  href text,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mc_notif_user_unread_idx
  on mc_notifications(user_id, created_at desc)
  where read_at is null;

create index if not exists mc_notif_org_idx
  on mc_notifications(organization_id, created_at desc);

-- Field notes (lightweight, linked as attachments or standalone)
create table if not exists mc_field_notes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  site_id uuid not null references mc_sites(id) on delete cascade,
  pour_id uuid references mc_concrete_pours(id) on delete set null,
  region_id uuid references mc_mapped_regions(id) on delete set null,
  note text not null,
  lat numeric,
  lng numeric,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table mc_site_occurrences enable row level security;
alter table mc_pour_status_history enable row level security;
alter table mc_notifications enable row level security;
alter table mc_field_notes enable row level security;

drop policy if exists mc_site_occurrences_select on mc_site_occurrences;
drop policy if exists mc_site_occurrences_insert on mc_site_occurrences;
drop policy if exists mc_site_occurrences_update on mc_site_occurrences;
drop policy if exists mc_pour_status_history_select on mc_pour_status_history;
drop policy if exists mc_pour_status_history_insert on mc_pour_status_history;
drop policy if exists mc_notifications_select on mc_notifications;
drop policy if exists mc_notifications_insert on mc_notifications;
drop policy if exists mc_notifications_update on mc_notifications;
drop policy if exists mc_field_notes_select on mc_field_notes;
drop policy if exists mc_field_notes_insert on mc_field_notes;

create policy mc_site_occurrences_select on mc_site_occurrences
  for select using (mc_is_org_member(organization_id));
create policy mc_site_occurrences_insert on mc_site_occurrences
  for insert with check (mc_is_org_member(organization_id));
create policy mc_site_occurrences_update on mc_site_occurrences
  for update using (mc_is_org_member(organization_id));

create policy mc_pour_status_history_select on mc_pour_status_history
  for select using (mc_is_org_member(organization_id));
create policy mc_pour_status_history_insert on mc_pour_status_history
  for insert with check (mc_is_org_member(organization_id));

create policy mc_notifications_select on mc_notifications
  for select using (auth.uid() = user_id);
create policy mc_notifications_insert on mc_notifications
  for insert with check (mc_is_org_member(organization_id));
create policy mc_notifications_update on mc_notifications
  for update using (auth.uid() = user_id);

create policy mc_field_notes_select on mc_field_notes
  for select using (mc_is_org_member(organization_id));
create policy mc_field_notes_insert on mc_field_notes
  for insert with check (mc_is_org_member(organization_id));
