/**
 * Spec §12 acceptance checklist — code-level coverage map (MapaConcreto).
 * Used by tests and /mapas/aceitacao UI. Does not invent volumes.
 */

export type AcceptanceItem = {
  id: string;
  criterion: string;
  status: "covered" | "partial" | "env_dependent";
  evidence: string;
  gap?: string;
};

export const ACCEPTANCE_CHECKLIST: AcceptanceItem[] = [
  {
    id: "12.1",
    criterion:
      "Importar PDF multipágina, escolher página e calibrar escala por dois pontos.",
    status: "covered",
    evidence:
      "uploadPlantPdfAction + PlantViewer (página + calibrar) + metersPerPdfUnit test",
  },
  {
    id: "12.2",
    criterion:
      "Desenhar e salvar retângulo, polígono irregular e traço livre convertido em região válida.",
    status: "covered",
    evidence: "PlantViewer tools + saveRegionAction + freehandToPolygon test",
  },
  {
    id: "12.3",
    criterion:
      "Reabrir a planta e visualizar as regiões no mesmo lugar após zoom e pan.",
    status: "covered",
    evidence:
      "Persistência GeoJSON em mc_mapped_regions; viewer reaplica world→screen",
  },
  {
    id: "12.4",
    criterion:
      "Laje 40 m² × 0,15 m; mapear 25 m² → 62,5% e 3,75 m³.",
    status: "covered",
    evidence: "geometry.test.ts acceptance case + seed DEMO",
  },
  {
    id: "12.5",
    criterion:
      "Concretagem em duas etapas no mesmo elemento com % acumulado sem dupla contagem.",
    status: "covered",
    evidence:
      "accumulatedSlabCoverage / computeAccumulatedForElement (união) + seed C-DEMO-01/02",
  },
  {
    id: "12.6",
    criterion:
      "Uma NF a duas regiões e duas NFs a uma região; pesquisa bidirecional.",
    status: "covered",
    evidence: "seed NF-DEMO-1001/1002 + /rastreio",
  },
  {
    id: "12.7",
    criterion: "Registrar Slump Test, anexar foto e laudo, consultar.",
    status: "partial",
    evidence: "createSlumpAction + uploadFieldPhotoAction + seed slump",
    gap: "Consulta explícita «por região» via rastreio/campo; laudo PDF genérico via anexo",
  },
  {
    id: "12.8",
    criterion:
      "Comparar volume teórico e NF sem classificar diferença como desperdício.",
    status: "covered",
    evidence: "compareVolumes labels + painel/relatório",
  },
  {
    id: "12.9",
    criterion:
      "Emitir relatório PDF com mapa, volumes, anexos e avisos de dados insuficientes.",
    status: "partial",
    evidence: "PDF esquemático + quantitativos + warnings",
    gap: "Mapa = esquema das regiões (não raster do PDF original); anexos listados se presentes",
  },
  {
    id: "12.10",
    criterion:
      "Criar revisão da planta sem apagar/deslocar automaticamente o mapeamento anterior.",
    status: "covered",
    evidence:
      "createDrawingRevisionCopyAction + reconcile (cópia só explícita)",
  },
  {
    id: "12.11",
    criterion:
      "Pilar parcial só por planta → pedir altura ou marcar indeterminado.",
    status: "covered",
    evidence:
      "computeVerticalMappedQuantity / computeColumnMappedQuantity + tests",
  },
  {
    id: "12.12",
    criterion:
      "Testes de geometria, cálculos, permissões e persistência.",
    status: "partial",
    evidence:
      "geometry/boolean/rules/indicators/workflow tests + rls-matrix; persistência via migrations/seed",
    gap: "Testes E2E browser com Supabase real dependem do ambiente do usuário",
  },
];

export function acceptanceSummary() {
  const covered = ACCEPTANCE_CHECKLIST.filter((i) => i.status === "covered").length;
  const partial = ACCEPTANCE_CHECKLIST.filter((i) => i.status === "partial").length;
  const env = ACCEPTANCE_CHECKLIST.filter(
    (i) => i.status === "env_dependent",
  ).length;
  return {
    total: ACCEPTANCE_CHECKLIST.length,
    covered,
    partial,
    envDependent: env,
    readyInCode: covered + partial === ACCEPTANCE_CHECKLIST.length,
  };
}
