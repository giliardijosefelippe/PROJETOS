import { resolveInsunits } from "./units";
import { parseAsciiDxf } from "./parse-ascii";
import type { CadEntity, CadLayer, CadModel } from "./types";
import type { DxfRawEntity } from "./types";

function scalePoint(
  p: [number, number],
  toMeters: number,
): [number, number] {
  return [p[0] * toMeters, p[1] * toMeters];
}

function entityToCad(
  e: DxfRawEntity,
  index: number,
  toMeters: number,
): CadEntity | null {
  const id = e.handle || `e-${index}`;
  const layer = e.layer || "0";
  const warnings: string[] = [];

  if (e.type === "LINE" && e.points.length >= 2) {
    return {
      id,
      layer,
      sourceType: "LINE",
      handle: e.handle,
      geometryKind: "LineString",
      coordinates: e.points
        .slice(0, 2)
        .map((p) => scalePoint(p, toMeters)),
      warnings,
    };
  }

  if (
    (e.type === "LWPOLYLINE" || e.type === "POLYLINE") &&
    e.points.length >= 2
  ) {
    const coords = e.points.map((p) => scalePoint(p, toMeters));
    if (e.closed && coords.length >= 3) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      const ring =
        first[0] === last[0] && first[1] === last[1]
          ? coords
          : [...coords, first];
      return {
        id,
        layer,
        sourceType: e.type,
        handle: e.handle,
        geometryKind: "Polygon",
        coordinates: [ring],
        warnings,
      };
    }
    return {
      id,
      layer,
      sourceType: e.type,
      handle: e.handle,
      geometryKind: "LineString",
      coordinates: coords,
      warnings,
    };
  }

  if ((e.type === "CIRCLE" || e.type === "ARC") && e.points.length >= 2) {
    const coords = e.points.map((p) => scalePoint(p, toMeters));
    if (e.closed || e.type === "CIRCLE") {
      const first = coords[0];
      const last = coords[coords.length - 1];
      const ring =
        Math.hypot(first[0] - last[0], first[1] - last[1]) < 1e-9
          ? coords
          : [...coords, first];
      return {
        id,
        layer,
        sourceType: e.type,
        handle: e.handle,
        geometryKind: "Polygon",
        coordinates: [ring],
        warnings:
          e.type === "ARC"
            ? ["ARC amostrado como polilinha (aproximação)."]
            : warnings,
      };
    }
    return {
      id,
      layer,
      sourceType: e.type,
      handle: e.handle,
      geometryKind: "LineString",
      coordinates: coords,
      warnings: ["ARC amostrado como polilinha (aproximação)."],
    };
  }

  if (e.type === "TEXT" && e.points[0]) {
    return {
      id,
      layer,
      sourceType: "TEXT",
      handle: e.handle,
      geometryKind: "Point",
      coordinates: scalePoint(e.points[0], toMeters),
      warnings: e.text ? [] : ["TEXT sem conteúdo."],
    };
  }

  return null;
}

function bboxOf(entities: CadEntity[]): CadModel["bboxMeters"] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const visit = (c: unknown) => {
    if (!Array.isArray(c)) return;
    if (typeof c[0] === "number" && typeof c[1] === "number") {
      minX = Math.min(minX, c[0] as number);
      minY = Math.min(minY, c[1] as number);
      maxX = Math.max(maxX, c[0] as number);
      maxY = Math.max(maxY, c[1] as number);
      return;
    }
    for (const x of c) visit(x);
  };
  for (const e of entities) visit(e.coordinates);
  if (!Number.isFinite(minX)) return null;
  return { minX, minY, maxX, maxY };
}

export function dxfTextToCadModel(
  text: string,
  options?: { isDemo?: boolean; parser?: CadModel["parser"] },
): CadModel {
  const parsed = parseAsciiDxf(text);
  const units = resolveInsunits(parsed.insunits);
  const warnings = [...parsed.warnings, ...units.warnings];

  const entities: CadEntity[] = [];
  parsed.entities.forEach((e, i) => {
    const cad = entityToCad(e, i, units.toMeters);
    if (cad) {
      if (options?.isDemo) cad.isDemo = true;
      entities.push(cad);
    }
  });

  const countByLayer = new Map<string, number>();
  for (const e of entities) {
    countByLayer.set(e.layer, (countByLayer.get(e.layer) || 0) + 1);
  }

  const layers: CadLayer[] = parsed.layers.map((l) => ({
    name: l.name,
    colorAci: l.color,
    visible: !l.off && !l.frozen,
    frozen: l.frozen,
    entityCount: countByLayer.get(l.name) || 0,
  }));

  // ensure layers referenced by entities exist
  for (const name of countByLayer.keys()) {
    if (!layers.some((l) => l.name === name)) {
      layers.push({
        name,
        colorAci: 7,
        visible: true,
        frozen: false,
        entityCount: countByLayer.get(name) || 0,
      });
    }
  }

  warnings.push(
    "Nenhum elemento estrutural foi criado automaticamente a partir do DXF. Use cadastro manual ou CSV.",
  );

  return {
    sourceFormat: "dxf",
    parser: options?.parser || "ts-ascii",
    isDemo: Boolean(options?.isDemo),
    units: {
      insunits: units.insunits,
      label: units.label,
      toMeters: units.toMeters,
    },
    layers,
    entities,
    blocks: parsed.blockNames,
    warnings,
    bboxMeters: bboxOf(entities),
  };
}

/** Closed polygon on layer LAJE (demo) → area in m² when units are meters. */
export function findClosedPolygonAreaM2(
  model: CadModel,
  layerName: string,
): number | null {
  const target = model.entities.find(
    (e) =>
      e.layer === layerName &&
      e.geometryKind === "Polygon" &&
      Array.isArray(e.coordinates?.[0]),
  );
  if (!target) return null;
  const ring = target.coordinates[0] as [number, number][];
  let sum = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    sum += ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1];
  }
  return Math.abs(sum) / 2;
}
