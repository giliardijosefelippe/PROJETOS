/**
 * Assisted plant revision reconciliation (Fase 2).
 * Never silently repositions mappings — only classifies and proposes actions.
 */
import {
  intersectPolygons,
  polygonArea,
  polygonFromGeoJson,
  type GeoJsonPolygon,
  type Point,
  type Polygon,
} from "./geometry";
import { classifyContainment } from "./boolean";

export type RegionSnapshot = {
  id: string;
  name: string;
  drawingRevisionId: string;
  geometry: GeoJsonPolygon;
  areaM2: number | null;
  tool?: string | null;
  archivedAt?: string | null;
};

export type ReconcileStatus =
  | "orphan_on_source"
  | "matched_geometry"
  | "displaced_candidate"
  | "already_on_target"
  | "no_geometry";

export type ReconcileProposal = {
  sourceRegionId: string;
  sourceName: string;
  status: ReconcileStatus;
  targetRegionId: string | null;
  targetName: string | null;
  overlapRatio: number | null;
  centroidShiftM: number | null;
  areaDeltaM2: number | null;
  message: string;
  suggestedAction: "copy_to_target" | "reassociate" | "archive" | "review" | "none";
};

export type ReconcileReport = {
  sourceRevisionId: string;
  targetRevisionId: string;
  proposals: ReconcileProposal[];
  summary: {
    orphan: number;
    matched: number;
    displaced: number;
    alreadyOnTarget: number;
  };
  notes: string[];
};

function centroid(poly: Polygon): Point | null {
  const ring = poly[0];
  if (!ring || ring.length < 3) return null;
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sx += ring[i][0];
    sy += ring[i][1];
    n++;
  }
  if (!n) return null;
  return [sx / n, sy / n];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function almostSameGeometry(
  a: Polygon,
  b: Polygon,
  areaTolRatio = 0.02,
  centroidTolM = 0.05,
): { same: boolean; overlapRatio: number; shiftM: number; areaDelta: number } {
  const areaA = polygonArea(a);
  const areaB = polygonArea(b);
  const { area: inter } = intersectPolygons(a, b);
  const denom = Math.max(areaA, areaB, 1e-12);
  const overlapRatio = inter / denom;
  const ca = centroid(a);
  const cb = centroid(b);
  const shiftM = ca && cb ? dist(ca, cb) : Number.POSITIVE_INFINITY;
  const areaDelta = areaB - areaA;
  const areaClose =
    Math.abs(areaDelta) <= Math.max(areaA, areaB) * areaTolRatio + 1e-9;
  const same = overlapRatio >= 1 - areaTolRatio && shiftM <= centroidTolM && areaClose;
  return { same, overlapRatio, shiftM, areaDelta };
}

/**
 * Compare source revision regions against target.
 * Source mappings stay put; this only proposes assisted actions.
 */
export function compareRevisionRegions(args: {
  sourceRevisionId: string;
  targetRevisionId: string;
  sourceRegions: RegionSnapshot[];
  targetRegions: RegionSnapshot[];
}): ReconcileReport {
  const notes = [
    "Mapeamentos da revisão origem não são reposicionados automaticamente.",
    "Aceitar = copiar geometria explicitamente para a nova revisão.",
    "Reassociar = vincular a uma região já existente na revisão alvo.",
    "Arquivar = registrar que o mapeamento antigo não segue nesta revisão.",
  ];

  const targetActive = args.targetRegions.filter((r) => !r.archivedAt);
  const sourceActive = args.sourceRegions.filter((r) => !r.archivedAt);

  const usedTarget = new Set<string>();
  const proposals: ReconcileProposal[] = [];

  for (const src of sourceActive) {
    const srcPoly = polygonFromGeoJson(src.geometry);
    if (!srcPoly) {
      proposals.push({
        sourceRegionId: src.id,
        sourceName: src.name,
        status: "no_geometry",
        targetRegionId: null,
        targetName: null,
        overlapRatio: null,
        centroidShiftM: null,
        areaDeltaM2: null,
        message: "Região origem sem geometria válida.",
        suggestedAction: "archive",
      });
      continue;
    }

    let best: {
      t: RegionSnapshot;
      score: number;
      overlapRatio: number;
      shiftM: number;
      areaDelta: number;
      same: boolean;
    } | null = null;

    const normName = (s: string) =>
      s
        .toLowerCase()
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .replace(/[^a-z0-9]+/g, "");

    for (const t of targetActive) {
      if (usedTarget.has(t.id)) continue;
      const tPoly = polygonFromGeoJson(t.geometry);
      if (!tPoly) continue;
      const cmp = almostSameGeometry(srcPoly, tPoly);
      const containment = classifyContainment(tPoly, srcPoly);
      const nameBoost =
        src.name && t.name && normName(src.name) === normName(t.name)
          ? 2
          : src.name &&
              t.name &&
              (normName(src.name).includes(normName(t.name)) ||
                normName(t.name).includes(normName(src.name)))
            ? 0.8
            : 0;
      const score =
        cmp.overlapRatio * 10 -
        Math.min(cmp.shiftM, 50) * 0.1 +
        (containment.classification === "fully_contained" ? 1 : 0) +
        nameBoost;
      if (!best || score > best.score) {
        best = {
          t,
          score,
          overlapRatio: cmp.overlapRatio,
          shiftM: cmp.shiftM,
          areaDelta: cmp.areaDelta,
          same: cmp.same || (nameBoost >= 2 && cmp.overlapRatio >= 0.9),
        };
      }
    }

    if (best && best.same) {
      usedTarget.add(best.t.id);
      proposals.push({
        sourceRegionId: src.id,
        sourceName: src.name,
        status: "matched_geometry",
        targetRegionId: best.t.id,
        targetName: best.t.name,
        overlapRatio: best.overlapRatio,
        centroidShiftM: best.shiftM,
        areaDeltaM2: best.areaDelta,
        message: `Geometria equivalente em «${best.t.name}» (sobreposição ${(best.overlapRatio * 100).toFixed(1)}%).`,
        suggestedAction: "reassociate",
      });
      continue;
    }

    if (best && best.overlapRatio >= 0.25 && best.shiftM < 5) {
      usedTarget.add(best.t.id);
      proposals.push({
        sourceRegionId: src.id,
        sourceName: src.name,
        status: "displaced_candidate",
        targetRegionId: best.t.id,
        targetName: best.t.name,
        overlapRatio: best.overlapRatio,
        centroidShiftM: best.shiftM,
        areaDeltaM2: best.areaDelta,
        message: `Possível deslocamento vs «${best.t.name}» (Δ centroide ${best.shiftM.toFixed(2)} m, sobreposição ${(best.overlapRatio * 100).toFixed(1)}%). Revisar antes de aceitar.`,
        suggestedAction: "review",
      });
      continue;
    }

    proposals.push({
      sourceRegionId: src.id,
      sourceName: src.name,
      status: "orphan_on_source",
      targetRegionId: null,
      targetName: null,
      overlapRatio: best?.overlapRatio ?? null,
      centroidShiftM: best?.shiftM ?? null,
      areaDeltaM2: best?.areaDelta ?? null,
      message:
        "Região órfã na revisão origem — não há correspondente na nova revisão. Copiar ou arquivar explicitamente.",
      suggestedAction: "copy_to_target",
    });
  }

  for (const t of targetActive) {
    if (usedTarget.has(t.id)) continue;
    const linked = proposals.some((p) => p.targetRegionId === t.id);
    if (linked) continue;
    proposals.push({
      sourceRegionId: "",
      sourceName: "(—)",
      status: "already_on_target",
      targetRegionId: t.id,
      targetName: t.name,
      overlapRatio: null,
      centroidShiftM: null,
      areaDeltaM2: null,
      message: `Região «${t.name}» existe só na revisão alvo (nova).`,
      suggestedAction: "none",
    });
  }

  const summary = {
    orphan: proposals.filter((p) => p.status === "orphan_on_source").length,
    matched: proposals.filter((p) => p.status === "matched_geometry").length,
    displaced: proposals.filter((p) => p.status === "displaced_candidate").length,
    alreadyOnTarget: proposals.filter((p) => p.status === "already_on_target")
      .length,
  };

  return {
    sourceRevisionId: args.sourceRevisionId,
    targetRevisionId: args.targetRevisionId,
    proposals,
    summary,
    notes,
  };
}
