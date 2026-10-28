-- Etapa D: anotações em PDF, presença colaborativa (fundação)
-- Integrações PRUMO / DWG / IFC / IA permanecem stubs documentados — sem fingir serviço externo.

-- Marcações coordenadas sobre prancha/PDF de uma revisão
create table if not exists public.drawing_annotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  revision_id uuid not null references public.drawing_revisions(id) on delete cascade,
  page_number int not null default 1,
  -- coordenadas normalizadas 0..1 relativas à página (independente da resolução)
  x numeric not null check (x >= 0 and x <= 1),
  y numeric not null check (y >= 0 and y <= 1),
  width numeric not null default 0.04 check (width > 0 and width <= 1),
  height numeric not null default 0.04 check (height > 0 and height <= 1),
  label text not null default '',
  note text,
  color text not null default '#E00024',
  linked_issue_id uuid references public.issues(id) on delete set null,
  linked_run_item_id uuid references public.checklist_run_items(id) on delete set null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_annotations_revision
  on public.drawing_annotations(revision_id, page_number);

create trigger drawing_annotations_updated_at
  before update on public.drawing_annotations
  for each row execute function public.set_updated_at();

-- Presença / revisão colaborativa (MVP: heartbeat; sem locks fortes)
create table if not exists public.revision_presence (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  revision_id uuid not null references public.drawing_revisions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_seen_at timestamptz not null default now(),
  cursor_label text,
  unique (revision_id, user_id)
);

create index if not exists idx_presence_revision_seen
  on public.revision_presence(revision_id, last_seen_at desc);

-- Sugestões de IA (sempre pendentes de revisão humana)
create table if not exists public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  revision_id uuid not null references public.drawing_revisions(id) on delete cascade,
  source text not null default 'stub', -- stub | future_provider
  kind text not null default 'inconsistency_hint',
  title text not null,
  detail text,
  confidence numeric,
  status text not null default 'pending_human_review'
    check (status in ('pending_human_review', 'accepted', 'rejected', 'dismissed')),
  payload jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_ai_suggestions_revision
  on public.ai_suggestions(revision_id, status);

-- RLS
alter table public.drawing_annotations enable row level security;
alter table public.revision_presence enable row level security;
alter table public.ai_suggestions enable row level security;

drop policy if exists annotations_select on public.drawing_annotations;
create policy annotations_select on public.drawing_annotations
  for select using (public.is_org_member(organization_id));

drop policy if exists annotations_write on public.drawing_annotations;
create policy annotations_write on public.drawing_annotations
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

drop policy if exists presence_select on public.revision_presence;
create policy presence_select on public.revision_presence
  for select using (public.is_org_member(organization_id));

drop policy if exists presence_write on public.revision_presence;
create policy presence_write on public.revision_presence
  for all using (
    public.is_org_member(organization_id) and user_id = auth.uid()
  ) with check (
    public.is_org_member(organization_id) and user_id = auth.uid()
  );

drop policy if exists ai_suggestions_select on public.ai_suggestions;
create policy ai_suggestions_select on public.ai_suggestions
  for select using (public.is_org_member(organization_id));

drop policy if exists ai_suggestions_write on public.ai_suggestions;
create policy ai_suggestions_write on public.ai_suggestions
  for all using (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  ) with check (
    public.has_org_role(organization_id, array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

-- Imutabilidade: não alterar anotações de revisão aprovada
create or replace function public.enforce_annotation_immutable_revision()
returns trigger
language plpgsql
as $$
begin
  if public.revision_is_immutable(coalesce(new.revision_id, old.revision_id)) then
    raise exception 'Revisão imutável: anotações não podem ser alteradas';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_imm_annotations on public.drawing_annotations;
create trigger trg_imm_annotations
  before insert or update or delete on public.drawing_annotations
  for each row execute function public.enforce_annotation_immutable_revision();
