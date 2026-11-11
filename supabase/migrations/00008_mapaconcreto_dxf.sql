-- MapaConcreto Fase 2 — suporte DXF (layers + snapshot de entidades)
-- Não cria elementos estruturais automaticamente.

alter table mc_drawing_revisions
  add column if not exists source_kind text not null default 'pdf'
    check (source_kind in ('pdf', 'dxf'));

alter table mc_drawing_revisions
  add column if not exists cad_parser text;

alter table mc_drawing_revisions
  add column if not exists cad_insunits int;

alter table mc_drawing_revisions
  add column if not exists cad_unit_label text;

alter table mc_drawing_revisions
  add column if not exists cad_unit_to_m numeric;

alter table mc_drawing_revisions
  add column if not exists cad_layers jsonb not null default '[]'::jsonb;

alter table mc_drawing_revisions
  add column if not exists cad_entities jsonb not null default '[]'::jsonb;

alter table mc_drawing_revisions
  add column if not exists cad_warnings jsonb not null default '[]'::jsonb;

alter table mc_drawing_revisions
  add column if not exists cad_bbox jsonb;

comment on column mc_drawing_revisions.cad_entities is
  'Snapshot de geometrias CAD em metros (modelo interno). Não implica elementos estruturais.';
