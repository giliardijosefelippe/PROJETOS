/**
 * Geometry engine for MapaConcreto (drawing coordinates in meters after scale calibration).
 * Pure TS — no PostGIS required for Phase 1.
 */
import polygonClipping from "polygon-clipping";

export type Point = [number, number];
export type Ring = Point[];
/** GeoJSON-like polygon: outer ring + optional holes (closed rings preferred). */
export type Polygon = Ring[];
export type MultiPolygon = Polygon[];

export type GeometryWarning = {
  code: string;
  message: string;
};

const EPS = 1e-9;

export function almostEqual(a: number, b: number, eps = EPS): boolean {
  return Math.abs(a - b) <= eps;
}

export function ensureClosed(ring: Ring): Ring {
  if (ring.length === 0) return ring;
  const [fx, fy] = ring[0];
  const [lx, ly] = ring[ring.length - 1];
  if (almostEqual(fx, lx) && almostEqual(fy, ly)) return ring;
  return [...ring, [fx, fy]];
}

export function ringArea(ring: Ring): number {
  const r = ensureClosed(ring);
  let sum = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/** Signed area (positive = CCW). */
export function signedRingArea(ring: Ring): number {
  const r = ensureClosed(ring);
  let sum = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const [x1, y1] = r[i];
    const [x2, y2] = r[i + 1];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

export function polygonArea(polygon: Polygon): number {
  if (!polygon.length) return 0;
  let area = ringArea(polygon[0]);
  for (let i = 1; i < polygon.length; i++) {
    area -= ringArea(polygon[i]);
  }
  return Math.max(0, area);
}

export function multiPolygonArea(mp: MultiPolygon): number {
  return mp.reduce((acc, p) => acc + polygonArea(p), 0);
}

export function rectanglePolygon(
  x: number,
  y: number,
  w: number,
  h: number,
): Polygon {
  return [
    ensureClosed([
      [x, y],
      [x + w, y],
      [x + w, y + h],
      [x, y + h],
    ]),
  ];
}

/**
 * Convert freehand stroke to a closed polygon.
 * Simplifies with radial distance + optional RDP-like thinning.
 */
export function freehandToPolygon(
  points: Point[],
  options?: { minDistance?: number; closeGap?: number },
): { polygon: Polygon | null; warnings: GeometryWarning[] } {
  const warnings: GeometryWarning[] = [];
  const minDistance = options?.minDistance ?? 0.02;
  if (points.length < 3) {
    return {
      polygon: null,
      warnings: [
        {
          code: "freehand_too_short",
          message: "Traço livre precisa de ao menos 3 pontos distintos.",
        },
      ],
    };
  }

  const simplified: Point[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = simplified[simplified.length - 1];
    const d = Math.hypot(points[i][0] - prev[0], points[i][1] - prev[1]);
    if (d >= minDistance) simplified.push(points[i]);
  }

  if (simplified.length < 3) {
    return {
      polygon: null,
      warnings: [
        {
          code: "freehand_collapsed",
          message: "Após simplificação o polígono ficou inválido.",
        },
      ],
    };
  }

  const first = simplified[0];
  const last = simplified[simplified.length - 1];
  const gap = Math.hypot(last[0] - first[0], last[1] - first[1]);
  const closeGap = options?.closeGap ?? minDistance * 5;
  if (gap > closeGap) {
    warnings.push({
      code: "freehand_auto_closed",
      message:
        "Traço livre não estava fechado; o sistema fechou o polígono automaticamente.",
    });
  }

  const ring = ensureClosed(simplified);
  if (ringArea(ring) < EPS) {
    return {
      polygon: null,
      warnings: [
        {
          code: "zero_area",
          message: "Polígono com área zero após fechamento.",
        },
      ],
    };
  }

  if (hasSelfIntersection(ring)) {
    warnings.push({
      code: "self_intersection",
      message:
        "Polígono com possível autointerseção; revise os vértices antes de confiar no cálculo.",
    });
  }

  return { polygon: [ring], warnings };
}

function segmentsIntersect(
  a: Point,
  b: Point,
  c: Point,
  d: Point,
): boolean {
  const cross = (p: Point, q: Point, r: Point) =>
    (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = cross(a, b, c);
  const d2 = cross(a, b, d);
  const d3 = cross(c, d, a);
  const d4 = cross(c, d, b);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  return false;
}

export function hasSelfIntersection(ring: Ring): boolean {
  const r = ensureClosed(ring);
  const n = r.length - 1;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (segmentsIntersect(r[i], r[i + 1], r[j], r[j + 1])) return true;
    }
  }
  return false;
}

function toClipping(polygon: Polygon): polygonClipping.Polygon {
  return polygon.map((ring) => ensureClosed(ring).map(([x, y]) => [x, y]));
}

function fromClipping(mp: polygonClipping.MultiPolygon): MultiPolygon {
  return mp.map((poly) =>
    poly.map((ring) => ring.map(([x, y]) => [x, y] as Point)),
  );
}

export function intersectPolygons(
  a: Polygon,
  b: Polygon,
): { result: MultiPolygon; area: number } {
  try {
    const clipped = polygonClipping.intersection(
      toClipping(a),
      toClipping(b),
    );
    const result = fromClipping(clipped);
    return { result, area: multiPolygonArea(result) };
  } catch {
    return { result: [], area: 0 };
  }
}

export function unionPolygons(polygons: Polygon[]): {
  result: MultiPolygon;
  area: number;
} {
  if (!polygons.length) return { result: [], area: 0 };
  try {
    let acc: polygonClipping.Geom = toClipping(polygons[0]);
    for (let i = 1; i < polygons.length; i++) {
      acc = polygonClipping.union(acc, toClipping(polygons[i]));
    }
    const result = fromClipping(acc as polygonClipping.MultiPolygon);
    return { result, area: multiPolygonArea(result) };
  } catch {
    return { result: [], area: 0 };
  }
}

export type RegionOverlap = {
  aId: string;
  bId: string;
  overlapAreaM2: number;
};

/**
 * Detect pairwise overlaps. By default mapped volumes must use UNION
 * (not sum) so overlaps are not double-counted.
 */
export function detectRegionOverlaps(
  regions: Array<{ id: string; polygon: Polygon }>,
  minAreaM2 = 1e-6,
): RegionOverlap[] {
  const out: RegionOverlap[] = [];
  for (let i = 0; i < regions.length; i++) {
    for (let j = i + 1; j < regions.length; j++) {
      const { area } = intersectPolygons(
        regions[i].polygon,
        regions[j].polygon,
      );
      if (area > minAreaM2) {
        out.push({
          aId: regions[i].id,
          bId: regions[j].id,
          overlapAreaM2: area,
        });
      }
    }
  }
  return out;
}

export type ScaleCalibration = {
  /** Two points in page/PDF pixel space */
  p1: Point;
  p2: Point;
  /** Real-world distance between p1 and p2, in meters */
  realDistanceM: number;
};

/**
 * Meters per PDF unit (pixel/user unit) derived from two-point calibration.
 */
export function metersPerPdfUnit(cal: ScaleCalibration): number | null {
  const dist = Math.hypot(cal.p2[0] - cal.p1[0], cal.p2[1] - cal.p1[1]);
  if (dist < EPS || cal.realDistanceM <= 0) return null;
  return cal.realDistanceM / dist;
}

export function pdfPointToWorld(p: Point, mPerUnit: number): Point {
  return [p[0] * mPerUnit, p[1] * mPerUnit];
}

export function worldPointToPdf(p: Point, mPerUnit: number): Point {
  return [p[0] / mPerUnit, p[1] / mPerUnit];
}

export type SlabQuantityInput = {
  elementAreaM2: number;
  thicknessM: number;
  intersectionAreaM2: number;
};

export type QuantityMethod = {
  method: string;
  dataOrigin: string;
  precisionNote: string;
  warnings: GeometryWarning[];
};

export type SlabQuantityResult = {
  percent: number;
  volumeMappedM3: number;
  meta: QuantityMethod;
};

/**
 * Flat element with constant thickness (slab).
 * Example: 40 m² element, 25 m² intersection, 0.15 m → 62.5% and 3.75 m³.
 */
export function computeSlabMappedQuantity(
  input: SlabQuantityInput,
): SlabQuantityResult {
  const warnings: GeometryWarning[] = [];
  if (input.elementAreaM2 <= 0) {
    warnings.push({
      code: "missing_element_area",
      message: "Área do elemento inválida; percentual indeterminado.",
    });
    return {
      percent: 0,
      volumeMappedM3: 0,
      meta: {
        method: "slab_constant_thickness",
        dataOrigin: "manual",
        precisionNote: "indeterminado",
        warnings,
      },
    };
  }
  if (input.thicknessM <= 0) {
    warnings.push({
      code: "missing_thickness",
      message: "Espessura ausente; volume indeterminado.",
    });
  }
  if (input.intersectionAreaM2 < 0) {
    warnings.push({
      code: "negative_intersection",
      message: "Área de interseção negativa ignorada.",
    });
  }

  const areaI = Math.max(0, input.intersectionAreaM2);
  const percent = (areaI / input.elementAreaM2) * 100;
  const volumeMappedM3 =
    input.thicknessM > 0 ? areaI * input.thicknessM : 0;

  return {
    percent,
    volumeMappedM3,
    meta: {
      method: "slab_constant_thickness",
      dataOrigin: "geometry_intersection_x_thickness",
      precisionNote:
        "Áreas em m² no referencial calibrado; sem desconto de vazios não modelados.",
      warnings,
    },
  };
}

export type VerticalElementInput = {
  footprintAreaM2: number;
  executedHeightM: number | null;
};

/**
 * Vertical elements (columns): plan projection alone does not determine volume.
 */
export function computeVerticalMappedQuantity(input: VerticalElementInput): {
  volumeMappedM3: number | null;
  indeterminate: boolean;
  meta: QuantityMethod;
} {
  if (input.executedHeightM == null || input.executedHeightM <= 0) {
    return {
      volumeMappedM3: null,
      indeterminate: true,
      meta: {
        method: "vertical_requires_height",
        dataOrigin: "plan_projection_insufficient",
        precisionNote: "indeterminado",
        warnings: [
          {
            code: "vertical_height_required",
            message:
              "Pilar/elemento vertical: informe altura ou trecho executado; a projeção em planta não define o volume.",
          },
        ],
      },
    };
  }
  return {
    volumeMappedM3: input.footprintAreaM2 * input.executedHeightM,
    indeterminate: false,
    meta: {
      method: "vertical_footprint_x_height",
      dataOrigin: "manual_height",
      precisionNote: "Altura informada pelo usuário; não inferida do PDF.",
      warnings: [],
    },
  };
}

export type VolumeCompareInput = {
  volumeTeoricoM3: number;
  volumeEstimadoMapeadoM3: number;
  volumeNfM3: number;
  volumeAlocadoM3: number;
  volumeDevolvidoM3: number;
  volumeOutrosDestinosM3: number;
};

export type VolumeCompareResult = {
  diferencaNfTeorico: number;
  desvioPercentualNfTeorico: number | null;
  saldoCarga: number;
  labels: {
    diferencaNfTeorico: string;
    note: string;
  };
};

/**
 * Comparative panel helpers. Never labels NF−teórico as waste.
 */
export function compareVolumes(input: VolumeCompareInput): VolumeCompareResult {
  const diferencaNfTeorico = input.volumeNfM3 - input.volumeTeoricoM3;
  const desvioPercentualNfTeorico =
    input.volumeTeoricoM3 > 0
      ? (diferencaNfTeorico / input.volumeTeoricoM3) * 100
      : null;
  const saldoCarga =
    input.volumeNfM3 -
    input.volumeAlocadoM3 -
    input.volumeDevolvidoM3 -
    input.volumeOutrosDestinosM3;

  return {
    diferencaNfTeorico,
    desvioPercentualNfTeorico,
    saldoCarga,
    labels: {
      diferencaNfTeorico: "Diferença NF − teórico (não é desperdício automático)",
      note:
        "Sobras, devoluções e outros destinos só entram quando registrados explicitamente.",
    },
  };
}

/**
 * Accumulated coverage for an element across multiple mapped regions:
 * use UNION of intersection areas, not sum of percents.
 */
export function accumulatedSlabCoverage(args: {
  elementPolygon: Polygon;
  elementAreaM2: number;
  thicknessM: number;
  regionPolygons: Polygon[];
}): SlabQuantityResult & { unionAreaM2: number } {
  const intersections: Polygon[] = [];
  for (const region of args.regionPolygons) {
    const { result } = intersectPolygons(args.elementPolygon, region);
    for (const p of result) intersections.push(p);
  }
  const { area: unionAreaM2 } = unionPolygons(intersections);
  const qty = computeSlabMappedQuantity({
    elementAreaM2: args.elementAreaM2,
    thicknessM: args.thicknessM,
    intersectionAreaM2: unionAreaM2,
  });
  return { ...qty, unionAreaM2 };
}

export type GeoJsonPolygon = {
  type: "Polygon";
  coordinates: Point[][];
};

export type GeoJsonMultiPolygon = {
  type: "MultiPolygon";
  coordinates: Point[][][];
};

export function polygonFromGeoJson(
  geom: GeoJsonPolygon | GeoJsonMultiPolygon | null | undefined,
): Polygon | null {
  if (!geom) return null;
  if (geom.type === "Polygon") {
    return geom.coordinates.map((ring) =>
      ring.map(([x, y]) => [x, y] as Point),
    );
  }
  if (geom.type === "MultiPolygon") {
    const first = geom.coordinates[0];
    if (!first) return null;
    return first.map((ring) => ring.map(([x, y]) => [x, y] as Point));
  }
  return null;
}

export function toGeoJsonPolygon(polygon: Polygon): GeoJsonPolygon {
  return {
    type: "Polygon",
    coordinates: polygon.map((ring) => ensureClosed(ring)),
  };
}
