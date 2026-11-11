-- MapaConcreto Fase 1 — schema + RLS
-- Depende de organizations / organization_memberships / users_profiles / audit_events (00001+)

-- Enums
do $$ begin
  create type mc_element_kind as enum (
    'laje', 'viga', 'pilar', 'parede', 'fundacao', 'sapata', 'radier', 'outro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type mc_quantity_source as enum (
    'manual', 'calculado', 'planilha', 'ifc', 'demo'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type mc_pour_status as enum (
    'planejada', 'em_execucao', 'aguardando_ensaios', 'em_analise',
    'conforme', 'nao_conforme', 'encerrada'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type mc_region_tool as enum ('rectangle', 'polygon', 'freehand');
exception when duplicate_object then null; end $$;

do $$ begin
  create type mc_attachment_parent as enum (
    'site', 'pour', 'delivery', 'element', 'region', 'slump', 'occurrence'
  );
exception when duplicate_object then null; end $$;

-- Obras
create table if not exists mc_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  description text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (organization_id, code)
);

create table if not exists mc_buildings (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references mc_sites(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  code text,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mc_floors (
  id uuid primary key default gen_random_uuid(),
  building_id uuid not null references mc_buildings(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  name text not null,
  level_index int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Desenhos / revisões (PDF original imutável por path+hash)
create table if not exists mc_drawing_revisions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references mc_sites(id) on delete cascade,
  floor_id uuid references mc_floors(id) on delete set null,
  organization_id uuid not null references organizations(id),
  revision_code text not null,
  title text not null,
  file_name text not null,
  storage_path text not null,
  content_hash text not null,
  mime_type text not null default 'application/pdf',
  page_count int not null default 1,
  selected_page int not null default 1,
  scale_p1 jsonb,
  scale_p2 jsonb,
  scale_real_m numeric,
  meters_per_pdf_unit numeric,
  unit text not null default 'm',
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, revision_code, file_name)
);

create table if not exists mc_structural_elements (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references mc_sites(id) on delete cascade,
  floor_id uuid references mc_floors(id) on delete set null,
  drawing_revision_id uuid references mc_drawing_revisions(id) on delete set null,
  organization_id uuid not null references organizations(id),
  code text not null,
  name text not null,
  kind mc_element_kind not null default 'laje',
  geometry jsonb,
  area_m2 numeric,
  thickness_m numeric,
  height_m numeric,
  volume_teorico_m3 numeric,
  quantity_source mc_quantity_source not null default 'manual',
  reliability text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, code)
);

create table if not exists mc_mapped_regions (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references mc_sites(id) on delete cascade,
  drawing_revision_id uuid not null references mc_drawing_revisions(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  name text not null,
  tool mc_region_tool not null,
  geometry jsonb not null,
  area_m2 numeric,
  color text,
  notes text,
  version int not null default 1,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mc_region_element_intersections (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  region_id uuid not null references mc_mapped_regions(id) on delete cascade,
  element_id uuid not null references mc_structural_elements(id) on delete cascade,
  intersection_area_m2 numeric,
  percent numeric,
  volume_estimado_m3 numeric,
  method text not null,
  data_origin text,
  precision_note text,
  warnings jsonb not null default '[]'::jsonb,
  indeterminate boolean not null default false,
  created_at timestamptz not null default now(),
  unique (region_id, element_id)
);

create table if not exists mc_concrete_pours (
  id uuid primary key default gen_random_uuid(),
  site_id uuid not null references mc_sites(id) on delete cascade,
  floor_id uuid references mc_floors(id) on delete set null,
  organization_id uuid not null references organizations(id),
  code text not null,
  title text not null,
  status mc_pour_status not null default 'planejada',
  pour_date date,
  started_at timestamptz,
  ended_at timestamptz,
  responsible_name text,
  fck_mpa numeric,
  slump_spec_mm numeric,
  volume_planned_m3 numeric,
  notes text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (site_id, code)
);

create table if not exists mc_pour_regions (
  pour_id uuid not null references mc_concrete_pours(id) on delete cascade,
  region_id uuid not null references mc_mapped_regions(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  primary key (pour_id, region_id)
);

create table if not exists mc_pour_elements (
  pour_id uuid not null references mc_concrete_pours(id) on delete cascade,
  element_id uuid not null references mc_structural_elements(id) on delete cascade,
  organization_id uuid not null references organizations(id),
  primary key (pour_id, element_id)
);

create table if not exists mc_suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  name text not null,
  is_demo boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists mc_truck_deliveries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  site_id uuid not null references mc_sites(id) on delete cascade,
  pour_id uuid references mc_concrete_pours(id) on delete set null,
  supplier_id uuid references mc_suppliers(id) on delete set null,
  plate text,
  truck_id text,
  nf_number text not null,
  volume_nf_m3 numeric not null,
  fck_mpa numeric,
  slump_spec_mm numeric,
  loaded_at timestamptz,
  arrived_at timestamptz,
  unload_started_at timestamptz,
  unload_ended_at timestamptz,
  volume_returned_m3 numeric not null default 0,
  volume_other_dest_m3 numeric not null default 0,
  notes text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mc_delivery_region_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  delivery_id uuid not null references mc_truck_deliveries(id) on delete cascade,
  region_id uuid not null references mc_mapped_regions(id) on delete cascade,
  volume_allocated_m3 numeric not null,
  volume_discharged_m3 numeric,
  notes text,
  created_at timestamptz not null default now(),
  unique (delivery_id, region_id)
);

create table if not exists mc_slump_tests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  delivery_id uuid not null references mc_truck_deliveries(id) on delete cascade,
  tested_at timestamptz not null default now(),
  slump_spec_mm numeric,
  tolerance_mm numeric,
  measured_mm numeric not null,
  compliant boolean,
  responsible_name text,
  notes text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists mc_attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  storage_path text not null,
  file_name text not null,
  mime_type text not null,
  byte_size bigint,
  content_hash text,
  description text,
  is_demo boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists mc_attachment_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  attachment_id uuid not null references mc_attachments(id) on delete cascade,
  parent_kind mc_attachment_parent not null,
  parent_id uuid not null,
  created_at timestamptz not null default now()
);

create index if not exists mc_sites_org_idx on mc_sites(organization_id);
create index if not exists mc_drawings_site_idx on mc_drawing_revisions(site_id);
create index if not exists mc_regions_drawing_idx on mc_mapped_regions(drawing_revision_id);
create index if not exists mc_deliveries_nf_idx on mc_truck_deliveries(organization_id, nf_number);
create index if not exists mc_deliveries_plate_idx on mc_truck_deliveries(organization_id, plate);

-- RLS helper: active membership
create or replace function mc_is_org_member(org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from organization_memberships m
    where m.organization_id = org_id
      and m.user_id = auth.uid()
      and m.status = 'active'
  );
$$;

alter table mc_sites enable row level security;
alter table mc_buildings enable row level security;
alter table mc_floors enable row level security;
alter table mc_drawing_revisions enable row level security;
alter table mc_structural_elements enable row level security;
alter table mc_mapped_regions enable row level security;
alter table mc_region_element_intersections enable row level security;
alter table mc_concrete_pours enable row level security;
alter table mc_pour_regions enable row level security;
alter table mc_pour_elements enable row level security;
alter table mc_suppliers enable row level security;
alter table mc_truck_deliveries enable row level security;
alter table mc_delivery_region_allocations enable row level security;
alter table mc_slump_tests enable row level security;
alter table mc_attachments enable row level security;
alter table mc_attachment_links enable row level security;

-- Policies (idempotent drop/create pattern)
do $$ declare t text;
begin
  foreach t in array array[
    'mc_sites','mc_buildings','mc_floors','mc_drawing_revisions',
    'mc_structural_elements','mc_mapped_regions','mc_region_element_intersections',
    'mc_concrete_pours','mc_pour_regions','mc_pour_elements','mc_suppliers',
    'mc_truck_deliveries','mc_delivery_region_allocations','mc_slump_tests',
    'mc_attachments','mc_attachment_links'
  ]
  loop
    execute format('drop policy if exists %I_select on %I', t, t);
    execute format('drop policy if exists %I_insert on %I', t, t);
    execute format('drop policy if exists %I_update on %I', t, t);
    execute format('drop policy if exists %I_delete on %I', t, t);
    execute format(
      'create policy %I_select on %I for select using (mc_is_org_member(organization_id))',
      t, t
    );
    execute format(
      'create policy %I_insert on %I for insert with check (mc_is_org_member(organization_id))',
      t, t
    );
    execute format(
      'create policy %I_update on %I for update using (mc_is_org_member(organization_id))',
      t, t
    );
    execute format(
      'create policy %I_delete on %I for delete using (mc_is_org_member(organization_id))',
      t, t
    );
  end loop;
end $$;
