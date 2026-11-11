/**
 * Parameterized quantity rules (Fase 2) with calculation memory.
 * Never invent volumes without required inputs.
 */
import type { GeometryWarning, QuantityMethod } from "./geometry";
import type { McElementKind } from "./types";

export type CalcStep = {
  label: string;
  formula: string;
  inputs: Record<string, number | string | null>;
  result: number | string | null;
};

export type CalculationMemory = {
  ruleId: string;
  elementKind: McElementKind;
  steps: CalcStep[];
  method: QuantityMethod;
  indeterminate: boolean;
  percent: number | null;
  volumeEstimadoM3: number | null;
};

export type BeamRuleInput = {
  /** Total axis length of the beam (m) */
  axisLengthM: number | null;
  /** Executed length along axis (m) — required for mapping */
  executedLengthM: number | null;
  /** Cross-section area (m²) */
  sectionAreaM2: number | null;
  /** Optional: plan intersection length estimate — NOT used alone */
  planIntersectionLengthM?: number | null;
};

/**
 * Linear element with constant section.
 * Spec §3.3: do not infer length only from 2D plan intersection without association rule.
 */
export function computeBeamMappedQuantity(
  input: BeamRuleInput,
): CalculationMemory {
  const warnings: GeometryWarning[] = [];
  const steps: CalcStep[] = [];

  steps.push({
    label: "Entradas",
    formula: "comprimento_eixo, comprimento_executado, area_secao",
    inputs: {
      axisLengthM: input.axisLengthM,
      executedLengthM: input.executedLengthM,
      sectionAreaM2: input.sectionAreaM2,
      planIntersectionLengthM: input.planIntersectionLengthM ?? null,
    },
    result: null,
  });

  if (input.sectionAreaM2 == null || input.sectionAreaM2 <= 0) {
    warnings.push({
      code: "beam_missing_section",
      message:
        "Viga: área da seção transversal ausente — volume indeterminado (não inventado).",
    });
  }
  if (input.executedLengthM == null || input.executedLengthM <= 0) {
    warnings.push({
      code: "beam_missing_executed_length",
      message:
        "Viga: informe o comprimento executado no eixo. A interseção 2D em planta não define sozinha o volume.",
    });
  }
  if (
    input.planIntersectionLengthM != null &&
    (input.executedLengthM == null || input.executedLengthM <= 0)
  ) {
    warnings.push({
      code: "beam_plan_length_insufficient",
      message:
        "Comprimento projetado em planta disponível, mas sem regra de associação ao eixo — não usado automaticamente.",
    });
  }

  const indeterminate =
    input.sectionAreaM2 == null ||
    input.sectionAreaM2 <= 0 ||
    input.executedLengthM == null ||
    input.executedLengthM <= 0;

  let volume: number | null = null;
  let percent: number | null = null;

  if (!indeterminate) {
    volume = input.executedLengthM! * input.sectionAreaM2!;
    steps.push({
      label: "Volume mapeado",
      formula: "volume = comprimento_executado × area_secao",
      inputs: {
        executedLengthM: input.executedLengthM,
        sectionAreaM2: input.sectionAreaM2,
      },
      result: volume,
    });
    if (input.axisLengthM != null && input.axisLengthM > 0) {
      percent = (input.executedLengthM! / input.axisLengthM) * 100;
      steps.push({
        label: "Percentual ao longo do eixo",
        formula: "percentual = comprimento_executado / comprimento_eixo × 100",
        inputs: {
          executedLengthM: input.executedLengthM,
          axisLengthM: input.axisLengthM,
        },
        result: percent,
      });
    } else {
      warnings.push({
        code: "beam_missing_axis_length",
        message:
          "Comprimento total do eixo ausente — percentual indeterminado; volume calculado só com trecho executado.",
      });
      steps.push({
        label: "Percentual",
        formula: "indeterminado (sem comprimento_eixo)",
        inputs: { axisLengthM: input.axisLengthM },
        result: null,
      });
    }
  }

  return {
    ruleId: "beam_constant_section",
    elementKind: "viga",
    steps,
    indeterminate,
    percent,
    volumeEstimadoM3: volume,
    method: {
      method: "beam_constant_section",
      dataOrigin: "manual_axis_and_section",
      precisionNote: indeterminate
        ? "indeterminado"
        : "Comprimento de eixo informado; não inferido só da planta.",
      warnings,
    },
  };
}

export type ColumnRuleInput = {
  footprintAreaM2: number | null;
  executedHeightM: number | null;
  /** Level markers optional — not enough alone without height delta */
  levelStartM?: number | null;
  levelEndM?: number | null;
};

export function computeColumnMappedQuantity(
  input: ColumnRuleInput,
): CalculationMemory {
  const warnings: GeometryWarning[] = [];
  const steps: CalcStep[] = [];

  let height = input.executedHeightM;
  if (
    (height == null || height <= 0) &&
    input.levelStartM != null &&
    input.levelEndM != null
  ) {
    height = Math.abs(input.levelEndM - input.levelStartM);
    steps.push({
      label: "Altura a partir de níveis",
      formula: "altura = |nível_final − nível_inicial|",
      inputs: {
        levelStartM: input.levelStartM,
        levelEndM: input.levelEndM,
      },
      result: height,
    });
  }

  steps.push({
    label: "Entradas",
    formula: "area_projecao, altura_executada",
    inputs: {
      footprintAreaM2: input.footprintAreaM2,
      executedHeightM: height,
    },
    result: null,
  });

  if (input.footprintAreaM2 == null || input.footprintAreaM2 <= 0) {
    warnings.push({
      code: "column_missing_footprint",
      message: "Pilar: área de projeção ausente.",
    });
  }
  if (height == null || height <= 0) {
    warnings.push({
      code: "vertical_height_required",
      message:
        "Pilar/elemento vertical: informe altura ou trecho executado; a projeção em planta não define o volume.",
    });
  }

  const indeterminate =
    input.footprintAreaM2 == null ||
    input.footprintAreaM2 <= 0 ||
    height == null ||
    height <= 0;

  const volume = indeterminate
    ? null
    : input.footprintAreaM2! * height!;

  if (!indeterminate) {
    steps.push({
      label: "Volume mapeado",
      formula: "volume = area_projecao × altura_executada",
      inputs: {
        footprintAreaM2: input.footprintAreaM2,
        executedHeightM: height,
      },
      result: volume,
    });
  }

  return {
    ruleId: "column_footprint_x_height",
    elementKind: "pilar",
    steps,
    indeterminate,
    percent: null,
    volumeEstimadoM3: volume,
    method: {
      method: indeterminate
        ? "vertical_requires_height"
        : "vertical_footprint_x_height",
      dataOrigin: indeterminate
        ? "plan_projection_insufficient"
        : "manual_height",
      precisionNote: indeterminate ? "indeterminado" : "Altura informada.",
      warnings,
    },
  };
}

export type FoundationRuleInput = {
  kind: "fundacao" | "sapata" | "radier";
  footprintAreaM2: number | null;
  /** Thickness / height of foundation block */
  thicknessM: number | null;
  intersectionAreaM2: number | null;
};

/**
 * Simple foundation / footing / raft: footprint × thickness (constant).
 */
export function computeFoundationMappedQuantity(
  input: FoundationRuleInput,
): CalculationMemory {
  const warnings: GeometryWarning[] = [];
  const steps: CalcStep[] = [];

  steps.push({
    label: "Entradas",
    formula: "area_elemento, area_intersecao, espessura",
    inputs: {
      footprintAreaM2: input.footprintAreaM2,
      intersectionAreaM2: input.intersectionAreaM2,
      thicknessM: input.thicknessM,
    },
    result: null,
  });

  if (input.footprintAreaM2 == null || input.footprintAreaM2 <= 0) {
    warnings.push({
      code: "foundation_missing_area",
      message: "Fundação: área de planta ausente — percentual indeterminado.",
    });
  }
  if (input.thicknessM == null || input.thicknessM <= 0) {
    warnings.push({
      code: "foundation_missing_thickness",
      message:
        "Fundação: espessura/altura ausente — volume indeterminado (não inventado).",
    });
  }
  if (input.intersectionAreaM2 == null || input.intersectionAreaM2 < 0) {
    warnings.push({
      code: "foundation_missing_intersection",
      message: "Área de interseção com a região ausente.",
    });
  }

  const hasArea =
    input.footprintAreaM2 != null && input.footprintAreaM2 > 0;
  const hasThick = input.thicknessM != null && input.thicknessM > 0;
  const hasI =
    input.intersectionAreaM2 != null && input.intersectionAreaM2 >= 0;

  let percent: number | null = null;
  let volume: number | null = null;
  const indeterminate = !hasArea || !hasThick || !hasI;

  if (hasArea && hasI) {
    percent = (input.intersectionAreaM2! / input.footprintAreaM2!) * 100;
    steps.push({
      label: "Percentual em planta",
      formula: "percentual = area(I) / area(E) × 100",
      inputs: {
        intersectionAreaM2: input.intersectionAreaM2,
        footprintAreaM2: input.footprintAreaM2,
      },
      result: percent,
    });
  }
  if (hasI && hasThick) {
    volume = input.intersectionAreaM2! * input.thicknessM!;
    steps.push({
      label: "Volume mapeado",
      formula: "volume = area(I) × espessura",
      inputs: {
        intersectionAreaM2: input.intersectionAreaM2,
        thicknessM: input.thicknessM,
      },
      result: volume,
    });
  }

  warnings.push({
    code: "foundation_simple_rule",
    message:
      "Regra simplificada de fundação (constante). Geometrias complexas exigem medição manual auditável.",
  });

  return {
    ruleId: "foundation_constant_thickness",
    elementKind: input.kind,
    steps,
    indeterminate: Boolean(indeterminate && volume == null),
    percent,
    volumeEstimadoM3: volume,
    method: {
      method: "foundation_constant_thickness",
      dataOrigin: "geometry_intersection_x_thickness",
      precisionNote:
        volume == null ? "indeterminado" : "Espessura constante assumida.",
      warnings,
    },
  };
}

export function pickRuleForKind(kind: McElementKind): string {
  switch (kind) {
    case "viga":
      return "beam_constant_section";
    case "pilar":
    case "parede":
      return "column_footprint_x_height";
    case "fundacao":
    case "sapata":
    case "radier":
      return "foundation_constant_thickness";
    case "laje":
      return "slab_constant_thickness";
    default:
      return "manual_or_indeterminate";
  }
}
