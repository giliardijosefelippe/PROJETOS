-- MapaConcreto closeout — unique keys for idempotent demo seed

create unique index if not exists mc_buildings_site_code_uidx
  on mc_buildings (site_id, code)
  where code is not null and length(trim(code)) > 0;

create unique index if not exists mc_floors_building_level_uidx
  on mc_floors (building_id, level_index)
  where level_index is not null;

comment on index mc_buildings_site_code_uidx is
  'Idempotent seed/upsert of buildings by site + code';
comment on index mc_floors_building_level_uidx is
  'Idempotent seed/upsert of floors by building + level_index';
