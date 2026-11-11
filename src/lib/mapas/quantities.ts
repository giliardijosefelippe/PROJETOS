import {
  accumulatedSlabCoverage,
  compareVolumes,
  computeSlabMappedQuantity,
  computeVerticalMappedQuantity,
  intersectPolygons,
  polygonArea,
  polygonFromGeoJson,
  type GeoJsonPolygon,
  type Polygon,
  type QuantityMethod,
} from "./geometry";
import type { McElementKind } from "./types";

export type ElementRecord = {
  id: string;
  kind: McElementKind;
  geometry: GeoJsonPolygon | null;
  area_m2: number | null;
  thickness_m: number | null;
  height_m: number | null;
  volume_teorico_m3: number | null;
};

export type RegionRecord = {
  id: string;
  geometry: GeoJsonPolygon;
  area_m2: number | null;
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
};

export function computeRegionElementIntersection(
  region: RegionRecord,
  element: ElementRecord,
): IntersectionComputation {
  const regionPoly = polygonFromGeoJson(region.geometry);
  const elementPoly = polygonFromGeoJson(element.geometry);

  if (!regionPoly) {
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

  // Vertical elements: never infer volume from plan alone
  if (element.kind === "pilar" || element.kind === "parede") {
    const footprint =
      elementPoly != null
        ? intersectPolygons(regionPoly, elementPoly).area
        : region.area_m2 ?? 0;
    const vert = computeVerticalMappedQuantity({
      footprintAreaM2: footprint,
      executedHeightM: element.height_m,
    });
    return {
      regionId: region.id,
      elementId: element.id,
      intersectionAreaM2: footprint,
      percent: null,
      volumeEstimadoM3: vert.volumeMappedM3,
      indeterminate: vert.indeterminate,
      method: vert.meta.method,
      dataOrigin: vert.meta.dataOrigin,
      precisionNote: vert.meta.precisionNote,
      warnings: vert.meta.warnings,
    };
  }

  // Slabs / constant-thickness planar
  if (!elementPoly) {
    // Fallback: if element has area but no geometry, use region area capped by element area
    const areaI = Math.min(
      region.area_m2 ?? 0,
      element.area_m2 ?? region.area_m2 ?? 0,
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
        ...qty.meta.warnings,
        {
          code: "element_without_geometry",
          message:
            "Elemento sem geometria vetorial; cálculo aproximado por áreas.",
        },
      ],
    };
  }

  const { area } = intersectPolygons(regionPoly, elementPoly);
  const elementArea = element.area_m2 ?? polygonArea(elementPoly);
  const qty = computeSlabMappedQuantity({
    elementAreaM2: elementArea,
    thicknessM: element.thickness_m ?? 0,
    intersectionAreaM2: area,
  });

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
    warnings: qty.meta.warnings,
  };
}

export function computeAccumulatedForElement(
  element: ElementRecord,
  regions: RegionRecord[],
) {
  const elementPoly = polygonFromGeoJson(element.geometry);
  if (!elementPoly || element.kind === "pilar" || element.kind === "parede") {
    return null;
  }
  const regionPolys: Polygon[] = [];
  for (const r of regions) {
    const p = polygonFromGeoJson(r.geometry);
    if (p) regionPolys.push(p);
  }
  return accumulatedSlabCoverage({
    elementPolygon: elementPoly,
    elementAreaM2: element.area_m2 ?? polygonArea(elementPoly),
    thicknessM: element.thickness_m ?? 0,
    regionPolygons: regionPolys,
  });
}

export { compareVolumes };
