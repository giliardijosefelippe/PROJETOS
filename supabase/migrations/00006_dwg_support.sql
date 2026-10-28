-- DWG/DXF drawing files: kind (original vs preview) + storage MIME allowlist
-- Apply after 00001–00005.

alter table public.drawing_files
  add column if not exists kind text not null default 'original';

alter table public.drawing_files
  add column if not exists source_format text;

alter table public.drawing_files
  add column if not exists parent_file_id uuid references public.drawing_files(id) on delete set null;

alter table public.drawing_files
  add column if not exists converter_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'drawing_files_kind_check'
  ) then
    alter table public.drawing_files
      add constraint drawing_files_kind_check
      check (kind in ('original', 'preview_pdf', 'preview_png'));
  end if;
end $$;

create index if not exists idx_drawing_files_revision_kind
  on public.drawing_files(revision_id, kind);

comment on column public.drawing_files.kind is
  'original = PDF/DXF/DWG enviado; preview_pdf/png = render do serviço Python';
comment on column public.drawing_files.source_format is
  'pdf | dxf | dwg | image — formato de origem do arquivo';
comment on column public.drawing_files.converter_path is
  'ex.: ezdxf | oda+ezdxf | passthrough-pdf';

-- Allow CAD originals + previews in library + evidence buckets
update storage.buckets
set
  file_size_limit = greatest(coalesce(file_size_limit, 0), 52428800),
  allowed_mime_types = array[
    'image/jpeg','image/png','image/webp','image/gif','image/svg+xml',
    'application/pdf',
    'video/mp4','video/webm',
    'application/dxf','image/vnd.dxf','application/x-dxf',
    'application/acad','application/x-acad','image/vnd.dwg',
    'application/octet-stream'
  ]
where id = 'library';

update storage.buckets
set
  file_size_limit = greatest(coalesce(file_size_limit, 0), 52428800),
  allowed_mime_types = array[
    'image/jpeg','image/png','image/webp','application/pdf',
    'application/dxf','image/vnd.dxf','application/x-dxf',
    'application/acad','application/x-acad','image/vnd.dwg',
    'application/octet-stream'
  ]
where id = 'evidence';

-- Desenhista/conferente também sobem pranchas no bucket library
drop policy if exists library_insert on storage.objects;
create policy library_insert on storage.objects
  for insert with check (
    bucket_id = 'library'
    and public.has_org_role(
      public.storage_org_id(name),
      array['admin','coordenador','desenhista','conferente']::membership_role[]
    )
  );

drop policy if exists library_update on storage.objects;
create policy library_update on storage.objects
  for update using (
    bucket_id = 'library'
    and public.has_org_role(
      public.storage_org_id(name),
      array['admin','coordenador','desenhista','conferente']::membership_role[]
    )
  );
