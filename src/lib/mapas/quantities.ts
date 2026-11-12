import {
  accumulatedSlabCoverage,
  compareVolumes,
  computeSlabMappedQuantity,
  intersectPolygons,
  polygonArea,
  polygonFromGeoJson,
  type GeoJsonPolygon,
  type Polygon,
  type QuantityMethod,
} from "./geometry";
import {
  accumulatedIntersectionWithVoids,
  analyzeRegionConflicts,
  classifyContainment,
  subtractVoids,
} from "./boolean";
import {
  accumulateBeamStages,
  computeBeamMappedQuantity,
  computeColumnMappedQuantity,
  computeFoundationMappedQuantity,
  type BeamStageLength,
  type CalculationMemory,
} from "./rules";
import type { McElementKind } from "./types";

export type ElementRecord = {
  id: string;
  kind: McElementKind;
  geometry: GeoJsonPolygon | null;
  area_m2: number | null;
  thickness_m: number | null;
  height_m: number | null;
  volume_teorico_m3: number | null;
  /** Beam: cross-section area (m²) */
  section_area_m2?: number | null;
  /** Beam: total axis length (m) */
  axis_length_m?: number | null;
  /** Beam: executed length (m) */
  executed_length_m?: number | null;
};

export type RegionRecord = {
  id: string;
  geometry: GeoJsonPolygon;
  area_m2: number | null;
  /** Optional void polygons (islands) in same CRS */
  voids?: GeoJsonPolygon[];
};

export type IntersectionComputation = {
  regionId: string;
  elementId: string;
  intersectionAreaM2: number;
  percent: number | null;
  volumeEstimadoM3: number | null;
  indeterminate: boolean;
  method: string;
  dataOrigin: string;
  precisionNote: string;
  warnings: QuantityMethod["warnings"];
  containment?: string;
  calcMemory?: CalculationMemory;
};

function applyRegionVoids(
  regionPoly: Polygon,
  voids: GeoJsonPolygon[] | undefined,
): { poly: Polygon; area: number; warnings: QuantityMethod["warnings"] } {
  if (!voids?.length) {
    return { poly: regionPoly, area: polygonArea(regionPoly), warnings: [] };
  }
  const voidPolys = voids
    .map((v) => polygonFromGeoJson(v))
    .filter(Boolean) as Polygon[];
  const sub = subtractVoids(regionPoly, voidPolys);
  const poly = sub.result[0] || regionPoly;
  return { poly, area: sub.area, warnings: sub.warnings };
}

export function computeRegionElementIntersection(
  region: RegionRecord,
  element: ElementRecord,
): IntersectionComputation {
  const regionPolyRaw = polygonFromGeoJson(region.geometry);
  const elementPoly = polygonFromGeoJson(element.geometry);

  if (!regionPolyRaw) {
    return {
      regionId: region.id,
      elementId: element.id,
      intersectionAreaM2: 0,
      percent: null,
      volumeEstimadoM3: null,
      indeterminate: true,
      method: "invalid_region",
      dataOrigin: "geometry",
      precisionNote: "região inválida",
      warnings: [
        {
          code: "invalid_region",
          message: "Geometria da região inválida.",
        },
      ],
    };
  }

  const voided = applyRegionVoids(regionPolyRaw, region.voids);
  const regionPoly = voided.poly;
  const baseWarnings = [...voided.warnings];

  let containment: string | undefined;
  if (elementPoly) {
    containment = classifyContainment(regionPoly, elementPoly).classification;
  }

  // Beams — parameterized rule (do not infer from plan alone)
  if (element.kind === "viga") {
    const mem = computeBeamMappedQuantity({
      axisLengthM: element.axis_length_m ?? null,
      executedLengthM: element.executed_length_m ?? null,
      sectionAreaM2: element.section_area_m2 ?? null,
    });
    const { area } = elementPoly
      ? intersectPolygons(regionPoly, elementPoly)
      : { area: 0 };
    return {
      regionId: region.id,
      elementId: element.id,
      intersectionAreaM2: area,
      percent: mem.percent,
      volumeEstimadoM3: mem.volumeEstimadoM3,
      indeterminate: mem.indeterminate,
      method: mem.method.method,
      dataOrigin: mem.method.dataOrigin,
      precisionNote: mem.method.precisionNote,
      warnings: [...baseWarnings, ...mem.method.warnings],
      containment,
      calcMemory: mem,
    };
  }

  // Columns / walls
  if (element.kind === "pilar" || element.kind === "parede") {
    const footprint =
      elementPoly != null
        ? intersectPolygons(regionPoly, elementPoly).area
        : region.area_m2 ?? 0;
    const mem = computeColumnMappedQuantity({
      footprintAreaM2: footprint,
      executedHeightM: element.height_m,
    });
    return {
      regionId: region.id,
      elementId: element.id,
      intersectionAreaM2: footprint,
      percent: mem.percent,
      volumeEstimadoM3: mem.volumeEstimadoM3,
      indeterminate: mem.indeterminate,
      method: mem.method.method,
      dataOrigin: mem.method.dataOrigin,
      precisionNote: mem.method.precisionNote,
      warnings: [...baseWarnings, ...mem.method.warnings],
      containment,
      calcMemory: mem,
    };
  }

  // Foundations
  if (
    element.kind === "fundacao" ||
    element.kind === "sapata" ||
    element.kind === "radier"
  ) {
    let areaI = 0;
    if (elementPoly) {
      areaI = intersectPolygons(regionPoly, elementPoly).area;
    } else {
      areaI = Math.min(
        voided.area,
        element.area_m2 ?? voided.area,
      );
    }
    const mem = computeFoundationMappedQuantity({
      kind: element.kind,
      footprintAreaM2: element.area_m2 ?? (elementPoly ? polygonArea(elementPoly) : null),
      thicknessM: element.thickness_m,
      intersectionAreaM2: areaI,
    });
    return {
      regionId: region.id,
      elementId: element.id,
      intersectionAreaM2: areaI,
      percent: mem.percent,
      volumeEstimadoM3: mem.volumeEstimadoM3,
      indeterminate: mem.indeterminate,
      method: mem.method.method,
      dataOrigin: mem.method.dataOrigin,
      precisionNote: mem.method.precisionNote,
      warnings: [...baseWarnings, ...mem.method.warnings],
      containment,
      calcMemory: mem,
    };
  }

  // Slabs / planar constant thickness
  if (!elementPoly) {
    const areaI = Math.min(
      voided.area,
      element.area_m2 ?? voided.area,
    );
    const qty = computeSlabMappedQuantity({
      elementAreaM2: element.area_m2 ?? 0,
      thicknessM: element.thickness_m ?? 0,
      intersectionAreaM2: areaI,
    });
    return {
      regionId: region.id,
      elementId: element.id,
      intersectionAreaM2: areaI,
      percent: qty.percent,
      volumeEstimadoM3: qty.volumeMappedM3,
      indeterminate: qty.meta.warnings.length > 0,
      method: qty.meta.method + "_area_fallback",
      dataOrigin: qty.meta.dataOrigin,
      precisionNote:
        "Elemento sem polígono: interseção aproximada por áreas cadastradas.",
      warnings: [
        ...baseWarnings,
        ...qty.meta.warnings,
        {
          code: "element_without_geometry",
          message:
            "Elemento sem geometria vetorial; cálculo aproximado por áreas.",
        },
      ],
      containment,
    };
  }

  const { area } = intersectPolygons(regionPoly, elementPoly);
  const elementArea = element.area_m2 ?? polygonArea(elementPoly);
  const qty = computeSlabMappedQuantity({
    elementAreaM2: elementArea,
    thicknessM: element.thickness_m ?? 0,
    intersectionAreaM2: area,
  });

  const calcMemory: CalculationMemory = {
    ruleId: "slab_constant_thickness",
    elementKind: "laje",
    steps: [
      {
        label: "Interseção",
        formula: "I = R ∩ E (com vazios descontados na região)",
        inputs: { intersectionAreaM2: area, elementAreaM2: elementArea },
        result: area,
      },
      {
        label: "Percentual / volume",
        formula: "% = area(I)/area(E)×100; vol = area(I)×espessura",
        inputs: {
          thicknessM: element.thickness_m,
          percent: qty.percent,
          volume: qty.volumeMappedM3,
        },
        result: qty.volumeMappedM3,
      },
    ],
    method: qty.meta,
    indeterminate: false,
    percent: qty.percent,
    volumeEstimadoM3: qty.volumeMappedM3,
  };

  return {
    regionId: region.id,
    elementId: element.id,
    intersectionAreaM2: area,
    percent: qty.percent,
    volumeEstimadoM3: qty.volumeMappedM3,
    indeterminate: false,
    method: qty.meta.method,
    dataOrigin: qty.meta.dataOrigin,
    precisionNote: qty.meta.precisionNote,
    warnings: [...baseWarnings, ...qty.meta.warnings],
    containment,
    calcMemory,
  };
}

export function computeAccumulatedForElement(
  element: ElementRecord,
  regions: RegionRecord[],
  opts?: { beamStages?: BeamStageLength[] },
) {
  const elementPoly = polygonFromGeoJson(element.geometry);
  if (!elementPoly) return null;

  if (element.kind === "pilar" || element.kind === "parede") {
    return null;
  }
  if (element.kind === "viga") {
    const stages =
      opts?.beamStages && opts.beamStages.length
        ? opts.beamStages
        : [
            {
              executedLengthM: element.executed_length_m ?? null,
              label: "elemento",
            },
          ];
    const acc = accumulateBeamStages({
      sectionAreaM2: element.section_area_m2 ?? null,
      axisLengthM: element.axis_length_m ?? null,
      stages,
    });
    return {
      percent: acc.percent ?? 0,
      volumeMappedM3: acc.volumeEstimadoM3 ?? 0,
      indeterminate: acc.indeterminate,
      unionAreaM2: 0,
      sumIntersectionAreaM2: 0,
      conflictWarnings: acc.method.warnings,
      calcMemory: acc,
      meta: acc.method,
    };
  }

  const prepared = regions.map((r) => {
    const p = polygonFromGeoJson(r.geometry)!;
    const voids = (r.voids || [])
      .map((v) => polygonFromGeoJson(v))
      .filter(Boolean) as Polygon[];
    return { polygon: p, voids };
  });

  const acc = accumulatedIntersectionWithVoids({
    element: elementPoly,
    regions: prepared,
  });

  const elementArea = element.area_m2 ?? polygonArea(elementPoly);
  const qty = computeSlabMappedQuantity({
    elementAreaM2: elementArea,
    thicknessM: element.thickness_m ?? 0,
    intersectionAreaM2: acc.unionAreaM2,
  });

  return {
    ...qty,
    unionAreaM2: acc.unionAreaM2,
    sumIntersectionAreaM2: acc.sumIntersectionAreaM2,
    conflictWarnings: acc.warnings,
  };
}

export function summarizeRegionSetConflicts(
  regions: RegionRecord[],
) {
  const polys = regions
    .map((r) => {
      const p = polygonFromGeoJson(r.geometry);
      return p ? { id: r.id, polygon: p } : null;
    })
    .filter(Boolean) as Array<{ id: string; polygon: Polygon }>;
  return analyzeRegionConflicts(polys);
}

export { compareVolumes, accumulatedSlabCoverage, analyzeRegionConflicts };
