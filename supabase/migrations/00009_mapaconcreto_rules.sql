-- MapaConcreto Fase 2 — parâmetros de regra (viga/pilar/fundação) + memória de cálculo

alter table mc_structural_elements
  add column if not exists section_area_m2 numeric;

alter table mc_structural_elements
  add column if not exists axis_length_m numeric;

alter table mc_structural_elements
  add column if not exists executed_length_m numeric;

comment on column mc_structural_elements.section_area_m2 is
  'Área da seção transversal (m²) — vigas; não inventar se nulo.';
comment on column mc_structural_elements.axis_length_m is
  'Comprimento total do eixo (m) — vigas.';
comment on column mc_structural_elements.executed_length_m is
  'Comprimento executado ao longo do eixo (m) — vigas.';

alter table mc_region_element_intersections
  add column if not exists calc_memory jsonb;

alter table mc_region_element_intersections
  add column if not exists containment text;

comment on column mc_region_element_intersections.calc_memory is
  'Memória de cálculo auditável (passos, fórmulas, avisos).';

-- Optional voids on mapped regions (GeoJSON Polygon array)
alter table mc_mapped_regions
  add column if not exists voids jsonb not null default '[]'::jsonb;

comment on column mc_mapped_regions.voids is
  'Polígonos de vazios/ilhas (GeoJSON) descontados na área líquida.';
