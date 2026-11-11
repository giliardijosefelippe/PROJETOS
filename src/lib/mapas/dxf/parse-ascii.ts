/**
 * Minimal ASCII DXF group-code parser for MapaConcreto Fase 2.
 * Supports LAYER table, LINE, LWPOLYLINE, POLYLINE/VERTEX, CIRCLE, ARC,
 * TEXT, INSERT (+ simple BLOCK expansion with translation/scale/rotation).
 * Does not invent structural elements — only CAD geometry.
 */
import type { Point } from "../geometry";
import type { DxfLayerInfo, DxfRawEntity } from "./types";

export type ParsedAsciiDxf = {
  insunits: number | null;
  measurement: number | null;
  layers: DxfLayerInfo[];
  entities: DxfRawEntity[];
  blockNames: string[];
  warnings: string[];
};

type Pair = { code: number; value: string };

function tokenize(text: string): Pair[] {
  const lines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const pairs: Pair[] = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    const code = Number(lines[i].trim());
    const value = lines[i + 1] ?? "";
    if (!Number.isFinite(code)) continue;
    pairs.push({ code, value: value.trimEnd() });
  }
  return pairs;
}

function num(v: string): number {
  const n = Number(String(v).trim());
  return Number.isFinite(n) ? n : 0;
}

function rotateScale(
  p: Point,
  origin: Point,
  xScale: number,
  yScale: number,
  rotDeg: number,
): Point {
  const rad = (rotDeg * Math.PI) / 180;
  const sx = p[0] * xScale;
  const sy = p[1] * yScale;
  const x = origin[0] + sx * Math.cos(rad) - sy * Math.sin(rad);
  const y = origin[1] + sx * Math.sin(rad) + sy * Math.cos(rad);
  return [x, y];
}

function sampleArc(
  cx: number,
  cy: number,
  r: number,
  startDeg: number,
  endDeg: number,
  segments = 24,
): Point[] {
  const a0 = startDeg;
  let a1 = endDeg;
  while (a1 < a0) a1 += 360;
  const pts: Point[] = [];
  for (let i = 0; i <= segments; i++) {
    const t = a0 + ((a1 - a0) * i) / segments;
    const rad = (t * Math.PI) / 180;
    pts.push([cx + r * Math.cos(rad), cy + r * Math.sin(rad)]);
  }
  return pts;
}

export function parseAsciiDxf(text: string): ParsedAsciiDxf {
  const warnings: string[] = [];
  if (!text || !text.includes("0")) {
    return {
      insunits: null,
      measurement: null,
      layers: [],
      entities: [],
      blockNames: [],
      warnings: ["DXF vazio ou inválido."],
    };
  }
  if (text.includes("AutoCAD Binary DXF") || text.charCodeAt(0) === 0x1a) {
    return {
      insunits: null,
      measurement: null,
      layers: [],
      entities: [],
      blockNames: [],
      warnings: [
        "DXF binário não suportado no parser TS. Exporte ASCII DXF ou use o serviço ezdxf.",
      ],
    };
  }

  const pairs = tokenize(text);
  let insunits: number | null = null;
  let measurement: number | null = null;
  const layers: DxfLayerInfo[] = [];
  const blockDefs = new Map<string, DxfRawEntity[]>();
  const blockNames: string[] = [];
  const modelEntities: DxfRawEntity[] = [];

  let section: string | null = null;
  let table: string | null = null;
  let i = 0;

  const readEntity = (
    startType: string,
    startIndex: number,
  ): { entity: DxfRawEntity; next: number } => {
    const entity: DxfRawEntity = {
      type: startType,
      layer: "0",
      handle: null,
      points: [],
    };
    let j = startIndex;
    let x: number | null = null;
    let bulgePending = false;
    const polyVerts: Point[] = [];
    let closed = false;
    let vertexCount: number | null = null;

    // POLYLINE collects following VERTEX until SEQEND
    if (startType === "POLYLINE") {
      while (j < pairs.length) {
        const { code, value } = pairs[j];
        if (code === 0) {
          const t = value.trim().toUpperCase();
          if (t === "VERTEX") {
            j++;
            let vx: number | null = null;
            let vy: number | null = null;
            while (j < pairs.length && pairs[j].code !== 0) {
              if (pairs[j].code === 10) vx = num(pairs[j].value);
              if (pairs[j].code === 20) vy = num(pairs[j].value);
              if (pairs[j].code === 8) entity.layer = pairs[j].value.trim();
              j++;
            }
            if (vx != null && vy != null) polyVerts.push([vx, vy]);
            continue;
          }
          if (t === "SEQEND") {
            j++;
            break;
          }
          break;
        }
        if (code === 8) entity.layer = value.trim();
        if (code === 5) entity.handle = value.trim();
        if (code === 70) closed = (num(value) & 1) === 1;
        j++;
      }
      entity.points = polyVerts;
      entity.closed = closed;
      entity.type = "POLYLINE";
      return { entity, next: j };
    }

    while (j < pairs.length) {
      const { code, value } = pairs[j];
      if (code === 0) break;
      switch (code) {
        case 5:
          entity.handle = value.trim();
          break;
        case 8:
          entity.layer = value.trim() || "0";
          break;
        case 1:
          entity.text = value;
          break;
        case 2:
          if (startType === "INSERT") entity.blockName = value.trim();
          break;
        case 10:
          x = num(value);
          break;
        case 20:
          if (x != null) {
            if (startType === "LWPOLYLINE") {
              polyVerts.push([x, num(value)]);
            } else if (
              startType === "LINE" ||
              startType === "CIRCLE" ||
              startType === "ARC" ||
              startType === "TEXT" ||
              startType === "INSERT"
            ) {
              entity.points.push([x, num(value)]);
            }
            x = null;
          }
          break;
        case 11: {
          // LINE end / second point x — stash in temp via reading 21 next
          const x2 = num(value);
          // look ahead for 21
          let k = j + 1;
          let y2 = 0;
          while (k < pairs.length && pairs[k].code !== 0) {
            if (pairs[k].code === 21) {
              y2 = num(pairs[k].value);
              break;
            }
            k++;
          }
          entity.points.push([x2, y2]);
          break;
        }
        case 40:
          if (startType === "CIRCLE" || startType === "ARC") {
            entity.radius = num(value);
          }
          break;
        case 41:
          if (startType === "INSERT") {
            entity.insert = entity.insert || {
              x: entity.points[0]?.[0] || 0,
              y: entity.points[0]?.[1] || 0,
              xScale: 1,
              yScale: 1,
              rotationDeg: 0,
            };
            entity.insert.xScale = num(value);
          }
          break;
        case 42:
          if (startType === "INSERT") {
            entity.insert = entity.insert || {
              x: entity.points[0]?.[0] || 0,
              y: entity.points[0]?.[1] || 0,
              xScale: 1,
              yScale: 1,
              rotationDeg: 0,
            };
            entity.insert.yScale = num(value);
          } else {
            bulgePending = true;
            void bulgePending;
          }
          break;
        case 50:
          if (startType === "ARC") entity.startAngleDeg = num(value);
          if (startType === "INSERT") {
            entity.insert = entity.insert || {
              x: entity.points[0]?.[0] || 0,
              y: entity.points[0]?.[1] || 0,
              xScale: 1,
              yScale: 1,
              rotationDeg: 0,
            };
            entity.insert.rotationDeg = num(value);
          }
          break;
        case 51:
          if (startType === "ARC") entity.endAngleDeg = num(value);
          break;
        case 70:
          if (startType === "LWPOLYLINE") closed = (num(value) & 1) === 1;
          break;
        case 90:
          if (startType === "LWPOLYLINE") vertexCount = Math.trunc(num(value));
          break;
        default:
          break;
      }
      j++;
    }

    if (startType === "LWPOLYLINE") {
      entity.points = polyVerts;
      entity.closed = closed;
      if (vertexCount != null && polyVerts.length !== vertexCount) {
        // still accept what we got
      }
    }
    if (startType === "INSERT" && entity.points[0]) {
      entity.insert = {
        x: entity.points[0][0],
        y: entity.points[0][1],
        xScale: entity.insert?.xScale ?? 1,
        yScale: entity.insert?.yScale ?? 1,
        rotationDeg: entity.insert?.rotationDeg ?? 0,
      };
    }
    if (startType === "ARC" && entity.points[0] && entity.radius != null) {
      entity.points = sampleArc(
        entity.points[0][0],
        entity.points[0][1],
        entity.radius,
        entity.startAngleDeg ?? 0,
        entity.endAngleDeg ?? 360,
      );
    }
    if (startType === "CIRCLE" && entity.points[0] && entity.radius != null) {
      entity.points = sampleArc(
        entity.points[0][0],
        entity.points[0][1],
        entity.radius,
        0,
        360,
      );
      entity.closed = true;
    }

    return { entity, next: j };
  };

  while (i < pairs.length) {
    const { code, value } = pairs[i];
    if (code === 0 && value.trim() === "SECTION") {
      const namePair = pairs[i + 1];
      section =
        namePair?.code === 2 ? namePair.value.trim().toUpperCase() : null;
      i += 2;
      continue;
    }
    if (code === 0 && value.trim() === "ENDSEC") {
      section = null;
      table = null;
      i++;
      continue;
    }
    if (section === "HEADER" && code === 9) {
      const key = value.trim().toUpperCase();
      const next = pairs[i + 1];
      if (key === "$INSUNITS" && next?.code === 70) {
        insunits = Math.trunc(num(next.value));
        i += 2;
        continue;
      }
      if (key === "$MEASUREMENT" && next?.code === 70) {
        measurement = Math.trunc(num(next.value));
        i += 2;
        continue;
      }
    }
    if (section === "TABLES" && code === 0 && value.trim() === "TABLE") {
      const namePair = pairs[i + 1];
      table =
        namePair?.code === 2 ? namePair.value.trim().toUpperCase() : null;
      i += 2;
      continue;
    }
    if (code === 0 && value.trim() === "ENDTAB") {
      table = null;
      i++;
      continue;
    }
    if (section === "TABLES" && table === "LAYER" && code === 0 && value.trim() === "LAYER") {
      let name = "0";
      let color = 7;
      let flags = 0;
      i++;
      while (i < pairs.length && pairs[i].code !== 0) {
        if (pairs[i].code === 2) name = pairs[i].value.trim();
        if (pairs[i].code === 62) color = Math.trunc(num(pairs[i].value));
        if (pairs[i].code === 70) flags = Math.trunc(num(pairs[i].value));
        i++;
      }
      layers.push({
        name,
        color: Math.abs(color),
        frozen: (flags & 1) === 1,
        off: color < 0,
      });
      continue;
    }

    if (section === "BLOCKS" && code === 0 && value.trim() === "BLOCK") {
      i++;
      let blockName = "";
      while (i < pairs.length && pairs[i].code !== 0) {
        if (pairs[i].code === 2) blockName = pairs[i].value.trim();
        i++;
      }
      const ents: DxfRawEntity[] = [];
      while (i < pairs.length) {
        if (pairs[i].code === 0) {
          const t = pairs[i].value.trim().toUpperCase();
          if (t === "ENDBLK") {
            i++;
            break;
          }
          if (
            [
              "LINE",
              "LWPOLYLINE",
              "POLYLINE",
              "CIRCLE",
              "ARC",
              "TEXT",
            ].includes(t)
          ) {
            const { entity, next } = readEntity(t, i + 1);
            ents.push(entity);
            i = next;
            continue;
          }
        }
        i++;
      }
      if (blockName && !blockName.startsWith("*")) {
        blockDefs.set(blockName.toUpperCase(), ents);
        blockNames.push(blockName);
      }
      continue;
    }

    if (section === "ENTITIES" && code === 0) {
      const t = value.trim().toUpperCase();
      if (
        [
          "LINE",
          "LWPOLYLINE",
          "POLYLINE",
          "CIRCLE",
          "ARC",
          "INSERT",
          "TEXT",
        ].includes(t)
      ) {
        const { entity, next } = readEntity(t, i + 1);
        modelEntities.push(entity);
        i = next;
        continue;
      }
    }
    i++;
  }

  // Expand INSERT → geometry (1 level)
  const expanded: DxfRawEntity[] = [];
  for (const e of modelEntities) {
    if (e.type !== "INSERT") {
      expanded.push(e);
      continue;
    }
    const name = (e.blockName || "").toUpperCase();
    const def = blockDefs.get(name);
    if (!def || !e.insert) {
      warnings.push(
        `INSERT '${e.blockName || "?"}' sem definição de bloco expansível — geometria omitida.`,
      );
      continue;
    }
    for (const be of def) {
      const pts = be.points.map((p) =>
        rotateScale(
          p,
          [e.insert!.x, e.insert!.y],
          e.insert!.xScale,
          e.insert!.yScale,
          e.insert!.rotationDeg,
        ),
      );
      expanded.push({
        ...be,
        layer: e.layer || be.layer,
        points: pts,
        handle: e.handle,
        type: be.type,
      });
    }
  }

  if (!layers.length) {
    const names = new Set(expanded.map((e) => e.layer || "0"));
    for (const n of names) {
      layers.push({ name: n, color: 7, frozen: false, off: false });
    }
  }

  return {
    insunits,
    measurement,
    layers,
    entities: expanded,
    blockNames,
    warnings,
  };
}
