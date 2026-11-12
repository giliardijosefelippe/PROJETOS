-- MapaConcreto polish — comprimento executado por etapa (viga multi-etapa)
-- Não inventa volumes: só soma trechos informados, com teto no eixo.

alter table mc_pour_elements
  add column if not exists executed_length_m numeric;

comment on column mc_pour_elements.executed_length_m is
  'Comprimento executado nesta etapa (m) para vigas; acumulação soma etapas com teto no eixo.';
