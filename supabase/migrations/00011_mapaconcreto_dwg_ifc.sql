-- MapaConcreto Fase 3 — DWG (via DXF intermediário) + IFC
-- Sem SDK pago. DWG nativo NÃO é lido sem ODA→DXF.

-- Expand source_kind check
alter table mc_drawing_revisions drop constraint if exists mc_drawing_revisions_source_kind_check;
alter table mc_drawing_revisions
  add constraint mc_drawing_revisions_source_kind_check
  check (source_kind in ('pdf', 'dxf', 'dwg', 'ifc'));

alter table mc_drawing_revisions
  add column if not exists intermediate_storage_path text;

alter table mc_drawing_revisions
  add column if not exists intermediate_format text;

alter table mc_drawing_revisions
  add column if not exists converter_path text;

alter table mc_drawing_revisions
  add column if not exists ifc_schema text;

alter table mc_drawing_revisions
  add column if not exists ifc_project_name text;

alter table mc_drawing_revisions
  add column if not exists ifc_unit_to_m numeric;

alter table mc_drawing_revisions
  add column if not exists ifc_summary jsonb not null default '{}'::jsonb;

comment on column mc_drawing_revisions.intermediate_storage_path is
  'Arquivo intermediário (ex. DXF gerado a partir de DWG via ODA). Original permanece em storage_path.';
comment on column mc_drawing_revisions.converter_path is
  'Caminho de conversão usado (ex. oda+ezdxf, ts-ifc-step).';

-- IFC linkage on structural elements
alter table mc_structural_elements
  add column if not exists ifc_guid text;

alter table mc_structural_elements
  add column if not exists ifc_type text;

alter table mc_structural_elements
  add column if not exists ifc_properties jsonb not null default '{}'::jsonb;

alter table mc_structural_elements
  add column if not exists ifc_quantity_origin text;

create unique index if not exists mc_elements_site_ifc_guid_uidx
  on mc_structural_elements(site_id, ifc_guid)
  where ifc_guid is not null;

comment on column mc_structural_elements.ifc_guid is
  'GlobalId IFC preservado; não inventar.';
comment on column mc_structural_elements.ifc_quantity_origin is
  'Ex.: Qto_SlabBaseQuantities.GrossVolume — null se volume não veio do arquivo.';
