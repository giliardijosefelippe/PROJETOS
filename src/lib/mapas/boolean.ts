/**
 * Advanced boolean ops for MapaConcreto Fase 2:
 * holes/islands, multi-region union, conflict classification.
 * Default accounting uses UNION — never double-count overlaps.
 */
import polygonClipping from "polygon-clipping";
import {
  ensureClosed,
  intersectPolygons,
  multiPolygonArea,
  polygonArea,
  unionPolygons,
  type GeometryWarning,
  type MultiPolygon,
  type Point,
  type Polygon,
  type Ring,
} from "./geometry";

const EPS = 1e-9;

function toClipping(polygon: Polygon): polygonClipping.Polygon {
  return polygon.map((ring) => ensureClosed(ring).map(([x, y]) => [x, y]));
}

function fromClipping(mp: polygonClipping.MultiPolygon): MultiPolygon {
  return mp.map((poly) =>
    poly.map((ring) => ring.map(([x, y]) => [x, y] as Point)),
  );
}

/** Outer ring minus hole rings (islands/voids) as GeoJSON-like Polygon. */
export function polygonWithHoles(outer: Ring, holes: Ring[] = []): Polygon {
  const outerRing = ensureClosed(outer);
  const holeRings = holes.map((h) => ensureClosed(h));
  return [outerRing, ...holeRings];
}

export function differencePolygons(
  subject: Polygon,
  clip: Polygon,
): { result: MultiPolygon; area: number } {
  try {
    const clipped = polygonClipping.difference(
      toClipping(subject),
      toClipping(clip),
    );
    const result = fromClipping(clipped);
    return { result, area: multiPolygonArea(result) };
  } catch {
    return { result: [], area: 0 };
  }
}

/**
 * Subtract multiple void polygons from a region (ilhas/vazios).
 */
export function subtractVoids(
  region: Polygon,
  voids: Polygon[],
): { result: MultiPolygon; area: number; warnings: GeometryWarning[] } {
  const warnings: GeometryWarning[] = [];
  if (!voids.length) {
    return {
      result: [region],
      area: polygonArea(region),
      warnings,
    };
  }
  let acc: polygonClipping.Geom = toClipping(region);
  for (const v of voids) {
    try {
      acc = polygonClipping.difference(acc, toClipping(v));
    } catch {
      warnings.push({
        code: "void_subtract_failed",
        message: "Falha ao subtrair vazio; geometria parcial mantida.",
      });
    }
  }
  const result = fromClipping(acc as polygonClipping.MultiPolygon);
  const area = multiPolygonArea(result);
  const gross = polygonArea(region);
  if (area + EPS < gross) {
    warnings.push({
      code: "voids_applied",
      message: `Vazios descontados: área líquida ${area.toFixed(4)} m² (bruta ${gross.toFixed(4)} m²).`,
    });
  }
  return { result, area, warnings };
}

export type ContainmentClass =
  | "fully_contained"
  | "partially_intersects"
  | "outside"
  | "covers_element";

/**
 * Classify how element E relates to region R (plan projection).
 */
export function classifyContainment(
  region: Polygon,
  element: Polygon,
  toleranceRatio = 1e-6,
): { classification: ContainmentClass; intersectionAreaM2: number; elementAreaM2: number; regionAreaM2: number } {
  const elementAreaM2 = polygonArea(element);
  const regionAreaM2 = polygonArea(region);
  const { area: intersectionAreaM2 } = intersectPolygons(region, element);
  if (intersectionAreaM2 <= EPS) {
    return {
      classification: "outside",
      intersectionAreaM2: 0,
      elementAreaM2,
      regionAreaM2,
    };
  }
  const elTol = Math.max(elementAreaM2 * toleranceRatio, EPS);
  const regTol = Math.max(regionAreaM2 * toleranceRatio, EPS);
  if (intersectionAreaM2 + elTol >= elementAreaM2) {
    return {
      classification: "fully_contained",
      intersectionAreaM2,
      elementAreaM2,
      regionAreaM2,
    };
  }
  if (intersectionAreaM2 + regTol >= regionAreaM2) {
    return {
      classification: "covers_element",
      intersectionAreaM2,
      elementAreaM2,
      regionAreaM2,
    };
  }
  return {
    classification: "partially_intersects",
    intersectionAreaM2,
    elementAreaM2,
    regionAreaM2,
  };
}

export type RegionConflictKind =
  | "overlap"
  | "duplicate_coverage"
  | "nested"
  | "none";

export type RegionConflict = {
  aId: string;
  bId: string;
  kind: RegionConflictKind;
  overlapAreaM2: number;
  /** How to account: always prefer union for volumes */
  accounting: "use_union" | "explicit_override_required";
  message: string;
};

/**
 * Analyze conflicts between mapped regions.
 * Sum of areas vs union area exposes double-counting risk.
 */
export function analyzeRegionConflicts(
  regions: Array<{ id: string; polygon: Polygon; name?: string }>,
): {
  conflicts: RegionConflict[];
  sumAreaM2: number;
  unionAreaM2: number;
  doubleCountRiskM2: number;
  warnings: GeometryWarning[];
} {
  const warnings: GeometryWarning[] = [];
  const conflicts: RegionConflict[] = [];
  let sumAreaM2 = 0;
  for (const r of regions) sumAreaM2 += polygonArea(r.polygon);

  const { area: unionAreaM2 } = unionPolygons(regions.map((r) => r.polygon));
  const doubleCountRiskM2 = Math.max(0, sumAreaM2 - unionAreaM2);

  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const a = regions[i];
      const b = regions[j];
      const { area } = intersectPolygons(a.polygon, b.polygon);
      if (area <= EPS) continue;

      const areaA = polygonArea(a.polygon);
      const areaB = polygonArea(b.polygon);
      let kind: RegionConflictKind = "overlap";
      if (area + EPS >= Math.min(areaA, areaB)) {
        kind = areaA <= areaB ? "nested" : "nested";
      }
      if (Math.abs(areaA - areaB) < EPS && Math.abs(area - areaA) < EPS) {
        kind = "duplicate_coverage";
      }

      conflicts.push({
        aId: a.id,
        bId: b.id,
        kind,
        overlapAreaM2: area,
        accounting: "use_union",
        message:
          kind === "duplicate_coverage"
            ? `Regiões ${a.name || a.id} e ${b.name || b.id} cobrem a mesma área (${area.toFixed(3)} m²). Use união.`
            : kind === "nested"
              ? `Região aninhada entre ${a.name || a.id} e ${b.name || b.id} (∩ ${area.toFixed(3)} m²). Contabilize por união.`
              : `Sobreposição ${a.name || a.id} ∩ ${b.name || b.id} = ${area.toFixed(3)} m². Sem soma simples.`,
      });
    }
  }

  if (doubleCountRiskM2 > EPS) {
    warnings.push({
      code: "double_count_risk",
      message: `Soma das áreas (${sumAreaM2.toFixed(3)} m²) excede a união (${unionAreaM2.toFixed(3)} m²) em ${doubleCountRiskM2.toFixed(3)} m² — risco de dupla contagem se somar %.`,
    });
  }

  return {
    conflicts,
    sumAreaM2,
    unionAreaM2,
    doubleCountRiskM2,
    warnings,
  };
}

/**
 * Accumulated intersection of element with many regions, using UNION of
 * (region ∩ element), optionally after subtracting voids from each region.
 */
export function accumulatedIntersectionWithVoids(args: {
  element: Polygon;
  regions: Array<{ polygon: Polygon; voids?: Polygon[] }>;
}): {
  unionIntersection: MultiPolygon;
  unionAreaM2: number;
  sumIntersectionAreaM2: number;
  warnings: GeometryWarning[];
} {
  const warnings: GeometryWarning[] = [];
  const pieces: Polygon[] = [];
  let sumIntersectionAreaM2 = 0;

  for (const r of args.regions) {
    let regionPoly = r.polygon;
    if (r.voids?.length) {
      const sub = subtractVoids(r.polygon, r.voids);
      warnings.push(...sub.warnings);
      if (sub.result[0]) regionPoly = sub.result[0];
      else if (sub.result.length === 0) continue;
      else {
        // multi after voids — intersect each part
        for (const part of sub.result) {
          const { result, area } = intersectPolygons(part, args.element);
          sumIntersectionAreaM2 += area;
          for (const p of result) pieces.push(p);
        }
        continue;
      }
    }
    const { result, area } = intersectPolygons(regionPoly, args.element);
    sumIntersectionAreaM2 += area;
    for (const p of result) pieces.push(p);
  }

  const { result: unionIntersection, area: unionAreaM2 } =
    unionPolygons(pieces);
  if (sumIntersectionAreaM2 - unionAreaM2 > EPS) {
    warnings.push({
      code: "union_vs_sum",
      message: `Interseções: soma ${sumIntersectionAreaM2.toFixed(4)} m² → união ${unionAreaM2.toFixed(4)} m² (sem dupla contagem).`,
    });
  }

  return {
    unionIntersection,
    unionAreaM2,
    sumIntersectionAreaM2,
    warnings,
  };
}
