export type McElementKind =
  | "laje"
  | "viga"
  | "pilar"
  | "parede"
  | "fundacao"
  | "sapata"
  | "radier"
  | "outro";

export type McQuantitySource =
  | "manual"
  | "calculado"
  | "planilha"
  | "ifc"
  | "demo";

export type McPourStatus =
  | "planejada"
  | "em_execucao"
  | "aguardando_ensaios"
  | "em_analise"
  | "conforme"
  | "nao_conforme"
  | "encerrada";

export type McRegionTool = "rectangle" | "polygon" | "freehand";

export type McVolumeMetricKind =
  | "teorico"
  | "estimado_mapeado"
  | "nf"
  | "alocado"
  | "sobra_devolucao_outro";

export const ELEMENT_KIND_LABELS: Record<McElementKind, string> = {
  laje: "Laje",
  viga: "Viga",
  pilar: "Pilar",
  parede: "Parede estrutural",
  fundacao: "Bloco de fundação",
  sapata: "Sapata",
  radier: "Radier",
  outro: "Outro",
};

export const POUR_STATUS_LABELS: Record<McPourStatus, string> = {
  planejada: "Planejada",
  em_execucao: "Em execução",
  aguardando_ensaios: "Aguardando ensaios",
  em_analise: "Em análise",
  conforme: "Conforme",
  nao_conforme: "Não conforme",
  encerrada: "Encerrada",
};

export type McSite = {
  id: string;
  organization_id: string;
  code: string;
  name: string;
  description: string | null;
  is_demo: boolean;
  created_at: string;
};

export type McBuilding = {
  id: string;
  site_id: string;
  organization_id: string;
  name: string;
  code: string | null;
};

export type McFloor = {
  id: string;
  building_id: string;
  organization_id: string;
  name: string;
  level_index: number | null;
};

export type McDrawingRevision = {
  id: string;
  site_id: string;
  floor_id: string | null;
  organization_id: string;
  revision_code: string;
  title: string;
  file_name: string;
  storage_path: string;
  content_hash: string;
  page_count: number;
  selected_page: number;
  scale_p1: number[] | null;
  scale_p2: number[] | null;
  scale_real_m: number | null;
  meters_per_pdf_unit: number | null;
  unit: string;
  is_demo: boolean;
  created_at: string;
};

export type McStructuralElement = {
  id: string;
  site_id: string;
  floor_id: string | null;
  drawing_revision_id: string | null;
  organization_id: string;
  code: string;
  name: string;
  kind: McElementKind;
  geometry: unknown;
  area_m2: number | null;
  thickness_m: number | null;
  height_m: number | null;
  volume_teorico_m3: number | null;
  quantity_source: McQuantitySource;
  reliability: string | null;
  is_demo: boolean;
};

export type McMappedRegion = {
  id: string;
  site_id: string;
  drawing_revision_id: string;
  organization_id: string;
  name: string;
  tool: McRegionTool;
  geometry: unknown;
  area_m2: number | null;
  color: string | null;
  notes: string | null;
  is_demo: boolean;
  created_at: string;
};

export type McConcretePour = {
  id: string;
  site_id: string;
  floor_id: string | null;
  organization_id: string;
  code: string;
  title: string;
  status: McPourStatus;
  pour_date: string | null;
  fck_mpa: number | null;
  slump_spec_mm: number | null;
  volume_planned_m3: number | null;
  notes: string | null;
  is_demo: boolean;
};
