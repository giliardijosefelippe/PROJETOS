-- Storage buckets (run once; idempotent where possible)
-- Buckets must be private. Paths: {organization_id}/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('library', 'library', false, 52428800, array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','video/mp4','video/webm'
  ]),
  ('evidence', 'evidence', false, 20971520, array[
    'image/jpeg','image/png','image/webp','application/pdf'
  ]),
  ('reports', 'reports', false, 52428800, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Helper: first path segment = organization_id
create or replace function public.storage_org_id(object_name text)
returns uuid
language sql
immutable
as $$
  select nullif(split_part(object_name, '/', 1), '')::uuid;
$$;

-- library
drop policy if exists library_select on storage.objects;
create policy library_select on storage.objects
  for select using (
    bucket_id = 'library'
    and public.is_org_member(public.storage_org_id(name))
  );

drop policy if exists library_insert on storage.objects;
create policy library_insert on storage.objects
  for insert with check (
    bucket_id = 'library'
    and public.has_org_role(public.storage_org_id(name), array['admin','coordenador']::membership_role[])
  );

drop policy if exists library_update on storage.objects;
create policy library_update on storage.objects
  for update using (
    bucket_id = 'library'
    and public.has_org_role(public.storage_org_id(name), array['admin','coordenador']::membership_role[])
  );

drop policy if exists library_delete on storage.objects;
create policy library_delete on storage.objects
  for delete using (
    bucket_id = 'library'
    and public.has_org_role(public.storage_org_id(name), array['admin','coordenador']::membership_role[])
  );

-- evidence
drop policy if exists evidence_select on storage.objects;
create policy evidence_select on storage.objects
  for select using (
    bucket_id = 'evidence'
    and public.is_org_member(public.storage_org_id(name))
  );

drop policy if exists evidence_insert on storage.objects;
create policy evidence_insert on storage.objects
  for insert with check (
    bucket_id = 'evidence'
    and public.has_org_role(public.storage_org_id(name), array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

drop policy if exists evidence_update on storage.objects;
create policy evidence_update on storage.objects
  for update using (
    bucket_id = 'evidence'
    and public.has_org_role(public.storage_org_id(name), array['admin','coordenador','desenhista','conferente']::membership_role[])
  );

drop policy if exists evidence_delete on storage.objects;
create policy evidence_delete on storage.objects
  for delete using (
    bucket_id = 'evidence'
    and public.has_org_role(public.storage_org_id(name), array['admin','coordenador']::membership_role[])
  );

-- reports
drop policy if exists reports_select_storage on storage.objects;
create policy reports_select_storage on storage.objects
  for select using (
    bucket_id = 'reports'
    and public.is_org_member(public.storage_org_id(name))
  );

drop policy if exists reports_insert_storage on storage.objects;
create policy reports_insert_storage on storage.objects
  for insert with check (
    bucket_id = 'reports'
    and public.has_org_role(public.storage_org_id(name), array['admin','coordenador','desenhista','conferente','consulta']::membership_role[])
  );
