-- Etapa C: imutabilidade no banco (versão publicada, revisão aprovada, audit append-only)

-- ---------------------------------------------------------------------------
-- Published template versions: freeze sections/items/media
-- ---------------------------------------------------------------------------
create or replace function public.enforce_published_template_freeze()
returns trigger
language plpgsql
as $$
declare
  v_status template_version_status;
begin
  if tg_table_name = 'checklist_template_versions' then
    if tg_op = 'UPDATE' and old.status in ('published', 'superseded') then
      if new.version_number is distinct from old.version_number
         or new.template_id is distinct from old.template_id
         or new.organization_id is distinct from old.organization_id then
        raise exception 'Versão de template publicada/superseded é imutável (metadados de identidade)';
      end if;
      -- permitir apenas transição published → superseded
      if old.status = 'published' and new.status = 'superseded' then
        return new;
      end if;
      if old.status = 'superseded' then
        raise exception 'Versão superseded não pode ser alterada';
      end if;
      if old.status = 'published' and new.status = 'published' then
        -- bloqueia edição de snapshot_note / content_hash após publish
        if new.snapshot_note is distinct from old.snapshot_note
           or new.content_hash is distinct from old.content_hash
           or new.published_at is distinct from old.published_at
           or new.published_by is distinct from old.published_by then
          raise exception 'Conteúdo de versão publicada é imutável';
        end if;
      end if;
    end if;
    if tg_op = 'DELETE' and old.status in ('published', 'superseded') then
      raise exception 'Não é permitido excluir versão publicada/superseded';
    end if;
    return coalesce(new, old);
  end if;

  -- child tables: resolve version status
  if tg_table_name = 'checklist_sections' then
    select status into v_status from public.checklist_template_versions
      where id = coalesce(new.template_version_id, old.template_version_id);
  elsif tg_table_name = 'checklist_items' then
    select status into v_status from public.checklist_template_versions
      where id = coalesce(new.template_version_id, old.template_version_id);
  elsif tg_table_name = 'checklist_item_media' then
    select v.status into v_status
      from public.checklist_items i
      join public.checklist_template_versions v on v.id = i.template_version_id
      where i.id = coalesce(new.item_id, old.item_id);
  end if;

  if v_status in ('published', 'superseded') then
    raise exception 'Não é permitido alterar seções/itens/mídia de versão %', v_status;
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_freeze_template_versions on public.checklist_template_versions;
create trigger trg_freeze_template_versions
  before update or delete on public.checklist_template_versions
  for each row execute function public.enforce_published_template_freeze();

drop trigger if exists trg_freeze_sections on public.checklist_sections;
create trigger trg_freeze_sections
  before insert or update or delete on public.checklist_sections
  for each row execute function public.enforce_published_template_freeze();

drop trigger if exists trg_freeze_items on public.checklist_items;
create trigger trg_freeze_items
  before insert or update or delete on public.checklist_items
  for each row execute function public.enforce_published_template_freeze();

drop trigger if exists trg_freeze_item_media on public.checklist_item_media;
create trigger trg_freeze_item_media
  before insert or update or delete on public.checklist_item_media
  for each row execute function public.enforce_published_template_freeze();

-- ---------------------------------------------------------------------------
-- Approved revision: freeze responses, evidence, run items, revision fields
-- ---------------------------------------------------------------------------
create or replace function public.revision_is_immutable(p_revision_id uuid)
returns boolean
language sql
stable
as $$
  select coalesce(
    (select immutable from public.drawing_revisions where id = p_revision_id),
    false
  );
$$;

create or replace function public.enforce_immutable_revision()
returns trigger
language plpgsql
as $$
declare
  rev_id uuid;
  is_imm boolean;
begin
  if tg_table_name = 'drawing_revisions' then
    if tg_op = 'UPDATE' and old.immutable = true then
      -- allow no field changes once immutable
      raise exception 'Revisão aprovada é imutável; crie uma nova revisão';
    end if;
    if tg_op = 'DELETE' and old.immutable = true then
      raise exception 'Não é permitido excluir revisão aprovada';
    end if;
    return coalesce(new, old);
  end if;

  if tg_table_name = 'checklist_runs' then
    rev_id := coalesce(new.revision_id, old.revision_id);
  elsif tg_table_name = 'checklist_run_items' then
    select r.revision_id into rev_id from public.checklist_runs r
      where r.id = coalesce(new.run_id, old.run_id);
  elsif tg_table_name = 'checklist_item_responses' then
    select r.revision_id into rev_id
      from public.checklist_run_items ri
      join public.checklist_runs r on r.id = ri.run_id
      where ri.id = coalesce(new.run_item_id, old.run_item_id);
  elsif tg_table_name = 'response_evidence' then
    select r.revision_id into rev_id
      from public.checklist_item_responses resp
      join public.checklist_run_items ri on ri.id = resp.run_item_id
      join public.checklist_runs r on r.id = ri.run_id
      where resp.id = coalesce(new.response_id, old.response_id);
  elsif tg_table_name = 'drawing_files' then
    rev_id := coalesce(new.revision_id, old.revision_id);
  end if;

  is_imm := public.revision_is_immutable(rev_id);
  if is_imm then
    raise exception 'Revisão imutável: não é permitido alterar runs/respostas/evidências';
  end if;

  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_imm_revisions on public.drawing_revisions;
create trigger trg_imm_revisions
  before update or delete on public.drawing_revisions
  for each row execute function public.enforce_immutable_revision();

drop trigger if exists trg_imm_runs on public.checklist_runs;
create trigger trg_imm_runs
  before insert or update or delete on public.checklist_runs
  for each row execute function public.enforce_immutable_revision();

drop trigger if exists trg_imm_run_items on public.checklist_run_items;
create trigger trg_imm_run_items
  before insert or update or delete on public.checklist_run_items
  for each row execute function public.enforce_immutable_revision();

drop trigger if exists trg_imm_responses on public.checklist_item_responses;
create trigger trg_imm_responses
  before insert or update or delete on public.checklist_item_responses
  for each row execute function public.enforce_immutable_revision();

drop trigger if exists trg_imm_evidence on public.response_evidence;
create trigger trg_imm_evidence
  before insert or update or delete on public.response_evidence
  for each row execute function public.enforce_immutable_revision();

drop trigger if exists trg_imm_drawing_files on public.drawing_files;
create trigger trg_imm_drawing_files
  before insert or update or delete on public.drawing_files
  for each row execute function public.enforce_immutable_revision();

-- ---------------------------------------------------------------------------
-- Append-only: issue_events, audit_events (no update/delete)
-- ---------------------------------------------------------------------------
create or replace function public.enforce_append_only()
returns trigger
language plpgsql
as $$
begin
  raise exception 'Tabela % é append-only (sem UPDATE/DELETE)', tg_table_name;
end;
$$;

drop trigger if exists trg_append_issue_events on public.issue_events;
create trigger trg_append_issue_events
  before update or delete on public.issue_events
  for each row execute function public.enforce_append_only();

drop trigger if exists trg_append_audit_events on public.audit_events;
create trigger trg_append_audit_events
  before update or delete on public.audit_events
  for each row execute function public.enforce_append_only();

-- Self-approval guard (also at app layer)
create or replace function public.enforce_no_self_approval()
returns trigger
language plpgsql
as $$
declare
  owner uuid;
begin
  select production_owner_id into owner
    from public.drawing_revisions where id = new.revision_id;
  if owner is not null and owner = new.decided_by then
    raise exception 'Não é permitido aprovar a própria prancha (autor de produção)';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_no_self_approval on public.approvals;
create trigger trg_no_self_approval
  before insert on public.approvals
  for each row execute function public.enforce_no_self_approval();
