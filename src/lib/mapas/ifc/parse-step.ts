/**
 * Lightweight IFC STEP text parser for MapaConcreto Fase 3.
 * Preserves GlobalId / type / name / Qto quantities when present.
 * Does NOT invent volumes. Full geometry engine / 3D viewer intentionally out of scope.
 */
import { rectanglePolygon, toGeoJsonPolygon } from "../geometry";
import type { McElementKind } from "../types";
import type {
  IfcLengthUnit,
  IfcParseResult,
  IfcParsedElement,
  IfcParsedQuantity,
} from "./types";

const TYPE_TO_KIND: Record<string, McElementKind> = {
  IFCSLAB: "laje",
  IFCBEAM: "viga",
  IFCCOLUMN: "pilar",
  IFCWALL: "parede",
  IFCWALLSTANDARDCASE: "parede",
  IFCFOOTING: "fundacao",
  IFCPILE: "fundacao",
  IFCRAFTFOUNDATION: "radier",
};

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, "\n");
}

/** Split top-level STEP args respecting quotes and nested parentheses. */
export function splitStepArgs(inner: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  let inStr = false;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (inStr) {
      cur += ch;
      if (ch === "'") {
        if (inner[i + 1] === "'") {
          cur += "'";
          i++;
        } else {
          inStr = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inStr = true;
      cur += ch;
      continue;
    }
    if (ch === "(") {
      depth++;
      cur += ch;
      continue;
    }
    if (ch === ")") {
      depth--;
      cur += ch;
      continue;
    }
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function unquote(token: string): string | null {
  const t = token.trim();
  if (t === "$" || t === "*") return null;
  if (t.startsWith("'") && t.endsWith("'")) {
    return t.slice(1, -1).replace(/''/g, "'");
  }
  return t;
}

function parseNumber(token: string | null | undefined): number | null {
  if (token == null) return null;
  const t = token.trim();
  if (!t || t === "$" || t === "*") return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

type Entity = { id: number; type: string; args: string[] };

function parseEntities(text: string): Map<number, Entity> {
  const map = new Map<number, Entity>();
  const re = /#(\d+)\s*=\s*([A-Z0-9]+)\s*\(([\s\S]*?)\)\s*;/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const id = Number(m[1]);
    const type = m[2].toUpperCase();
    const args = splitStepArgs(m[3]);
    map.set(id, { id, type, args });
  }
  return map;
}

function refId(token: string | null | undefined): number | null {
  if (!token) return null;
  const m = token.trim().match(/^#(\d+)$/);
  return m ? Number(m[1]) : null;
}

function detectLengthUnit(entities: Map<number, Entity>): IfcLengthUnit {
  for (const e of entities.values()) {
    if (e.type === "IFCSIUNIT" && e.args.some((a) => a.includes(".LENGTHUNIT."))) {
      const name = e.args.find((a) => a.includes(".")) || "";
      if (name.includes(".MILLI.")) return { name: "MILLIMETRE", toMeters: 0.001 };
      if (name.includes(".CENTI.")) return { name: "CENTIMETRE", toMeters: 0.01 };
      if (name.includes(".METRE") || name.includes(".METER"))
        return { name: "METRE", toMeters: 1 };
    }
  }
  return { name: "assumed_metre", toMeters: 1 };
}

function findProjectName(entities: Map<number, Entity>): string | null {
  for (const e of entities.values()) {
    if (e.type === "IFCPROJECT") {
      return unquote(e.args[2] || "") || unquote(e.args[0] || "");
    }
  }
  return null;
}

function detectSchema(headerish: string): string | null {
  const m = headerish.match(/FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i);
  return m ? m[1] : null;
}

function collectQuantities(
  entities: Map<number, Entity>,
  productId: number,
): IfcParsedQuantity[] {
  const out: IfcParsedQuantity[] = [];
  // IFCRELDEFINESBYPROPERTIES (..., RelatedObjects, RelatingPropertyDefinition)
  for (const rel of entities.values()) {
    if (rel.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const related = rel.args[4] || "";
    if (!related.includes(`#${productId}`)) continue;
    const psetId = refId(rel.args[5]);
    if (psetId == null) continue;
    const pset = entities.get(psetId);
    if (!pset) continue;
    const psetName = unquote(pset.args[2] || "") || pset.type;
    // IFCELEMENTQUANTITY has list of quantities in last arg
    const qtyListArg =
      pset.type === "IFCELEMENTQUANTITY"
        ? pset.args[5] || pset.args[pset.args.length - 1]
        : pset.args[4] || pset.args[pset.args.length - 1];
    const ids = [...String(qtyListArg).matchAll(/#(\d+)/g)].map((x) =>
      Number(x[1]),
    );
    for (const qid of ids) {
      const q = entities.get(qid);
      if (!q) continue;
      const qName = unquote(q.args[0] || "") || unquote(q.args[2] || "") || q.type;
      let value: number | null = null;
      let unitHint: IfcParsedQuantity["unitHint"] = "unknown";
      if (q.type === "IFCQUANTITYVOLUME") {
        value = parseNumber(q.args[3] ?? q.args[q.args.length - 1]);
        unitHint = "m3";
      } else if (q.type === "IFCQUANTITYAREA") {
        value = parseNumber(q.args[3] ?? q.args[q.args.length - 1]);
        unitHint = "m2";
      } else if (q.type === "IFCQUANTITYLENGTH") {
        value = parseNumber(q.args[3] ?? q.args[q.args.length - 1]);
        unitHint = "m";
      }
      if (value == null) continue;
      out.push({
        name: qName,
        value,
        unitHint,
        origin: `${psetName}.${qName}`,
      });
    }
  }
  return out;
}

function collectProperties(
  entities: Map<number, Entity>,
  productId: number,
): Record<string, string | number | boolean | null> {
  const props: Record<string, string | number | boolean | null> = {};
  for (const rel of entities.values()) {
    if (rel.type !== "IFCRELDEFINESBYPROPERTIES") continue;
    const related = rel.args[4] || "";
    if (!related.includes(`#${productId}`)) continue;
    const psetId = refId(rel.args[5]);
    if (psetId == null) continue;
    const pset = entities.get(psetId);
    if (!pset || pset.type === "IFCELEMENTQUANTITY") continue;
    const psetName = unquote(pset.args[2] || "") || "Pset";
    const propsArg = pset.args[4] || pset.args[pset.args.length - 1] || "";
    const ids = [...String(propsArg).matchAll(/#(\d+)/g)].map((x) => Number(x[1]));
    for (const pid of ids) {
      const p = entities.get(pid);
      if (!p || p.type !== "IFCPROPERTYSINGLEVALUE") continue;
      const name = unquote(p.args[0] || "");
      if (!name) continue;
      const raw = p.args[2] || "";
      const num = raw.match(/IFC(?:REAL|LENGTHMEASURE|AREA MEASURE|VOLUMEMEASURE|INTEGER)\(([^)]+)\)/i);
      if (num) {
        props[`${psetName}.${name}`] = Number(num[1]);
      } else {
        props[`${psetName}.${name}`] = unquote(raw);
      }
    }
  }
  return props;
}

/** Very small footprint extractor: IFCEXTRUDEDAREASOLID + IFCRECTANGLEPROFILEDEF. */
function tryFootprint(
  entities: Map<number, Entity>,
  productId: number,
  toM: number,
): { polygon: ReturnType<typeof toGeoJsonPolygon>; thicknessM: number | null } | null {
  const product = entities.get(productId);
  if (!product) return null;
  // representation often arg index 6 for IfcProduct
  const repId = refId(product.args[6]);
  if (repId == null) return null;

  const visited = new Set<number>();
  const queue = [repId];
  let extruded: Entity | null = null;
  while (queue.length) {
    const id = queue.shift()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const e = entities.get(id);
    if (!e) continue;
    if (e.type === "IFCEXTRUDEDAREASOLID") {
      extruded = e;
      break;
    }
    for (const a of e.args) {
      for (const m of String(a).matchAll(/#(\d+)/g)) {
        queue.push(Number(m[1]));
      }
    }
  }
  if (!extruded) return null;
  const profileId = refId(extruded.args[0]);
  const depth = parseNumber(extruded.args[3] ?? extruded.args[extruded.args.length - 1]);
  if (profileId == null) return null;
  const profile = entities.get(profileId);
  if (!profile || profile.type !== "IFCRECTANGLEPROFILEDEF") return null;
  // IFCRECTANGLEPROFILEDEF(..., XDim, YDim) — last two numbers
  const nums = profile.args
    .map((a) => parseNumber(a))
    .filter((n): n is number => n != null);
  if (nums.length < 2) return null;
  const xDim = nums[nums.length - 2] * toM;
  const yDim = nums[nums.length - 1] * toM;
  const poly = rectanglePolygon(0, 0, xDim, yDim);
  return {
    polygon: toGeoJsonPolygon(poly),
    thicknessM: depth != null ? depth * toM : null,
  };
}

function mapElement(
  entity: Entity,
  entities: Map<number, Entity>,
  unit: IfcLengthUnit,
): IfcParsedElement | null {
  const kind = TYPE_TO_KIND[entity.type];
  if (!kind) return null;
  const guid = unquote(entity.args[0] || "");
  if (!guid) return null;
  const name = unquote(entity.args[2] || "") || guid;
  const objectType = unquote(entity.args[3] || "");
  const tag = unquote(entity.args[7] || entity.args[entity.args.length - 1] || "");
  const quantities = collectQuantities(entities, entity.id);
  const properties = collectProperties(entities, entity.id);
  const warnings: string[] = [];

  const volQ = quantities.find(
    (q) => q.unitHint === "m3" || /volume/i.test(q.name),
  );
  const areaQ = quantities.find(
    (q) => q.unitHint === "m2" || /area|grossarea/i.test(q.name),
  );
  const lenQ = quantities.find(
    (q) =>
      q.unitHint === "m" &&
      (/length|width|height|depth|thickness/i.test(q.name) || q.name === "Length"),
  );

  // Quantities in IFC are typically already in project units for length/area/volume.
  // Volume measures are m³ when SI length is metre; if length unit is mm, volumes in file
  // are still usually written as SI in many exports — we trust the Qto value as authored
  // and record origin. Do not invent a conversion for volume.
  const volumeM3 = volQ ? volQ.value : null;
  let areaM2 = areaQ ? areaQ.value : null;
  if (unit.toMeters !== 1 && areaQ && !/metre|meter/i.test(unit.name)) {
    // If length unit is mm and area looks like mm²-scale (huge), convert.
    if (areaM2 != null && areaM2 > 1e4) {
      areaM2 = areaM2 * unit.toMeters * unit.toMeters;
      warnings.push(
        "Área IFC convertida pelo fator de unidade de comprimento (possível mm²).",
      );
    }
  }

  const foot = tryFootprint(entities, entity.id, unit.toMeters);
  if (!areaM2 && foot) {
    const coords = foot.polygon.coordinates[0];
    // area from footprint already in m
    const xs = coords.map((c) => c[0]);
    const ys = coords.map((c) => c[1]);
    areaM2 =
      (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
    warnings.push(
      "Área estimada do footprint retangular IFC (não é volume).",
    );
  }

  if (volumeM3 == null) {
    warnings.push(
      "Volume teórico ausente no IFC — não inventado; cadastre manualmente se necessário.",
    );
  }

  let thicknessM = foot?.thicknessM ?? null;
  const thickQ = quantities.find((q) => /thickness|depth|height/i.test(q.name));
  if (thickQ && thickQ.unitHint === "m") {
    thicknessM = thickQ.value * (unit.name.includes("MILLI") ? unit.toMeters : 1);
  }

  return {
    guid,
    ifcType: entity.type,
    kind,
    name,
    objectType,
    tag,
    properties,
    quantities,
    volumeM3,
    areaM2,
    thicknessM,
    heightM: kind === "pilar" ? thicknessM : null,
    lengthM: lenQ && /length/i.test(lenQ.name) ? lenQ.value : null,
    footprint: foot?.polygon ?? null,
    quantityOrigin: volQ?.origin ?? null,
    warnings,
  };
}

export function parseIfcStep(
  text: string,
  opts?: { isDemo?: boolean },
): IfcParseResult {
  const cleaned = stripComments(text);
  const warnings: string[] = [];
  const notes = [
    "Parser STEP textual (Fase 3) — sem viewer 3D.",
    "Volumes só quando Qto* estiver no arquivo; nunca inventados.",
    "Geometria 3D completa / ifcopenshell opcional no serviço Python.",
  ];

  if (!/ISO-10303-21/i.test(cleaned) && !/IFC/i.test(cleaned)) {
    return {
      ok: false,
      parser: "ts-ifc-step",
      schema: null,
      projectName: null,
      unit: { name: "unknown", toMeters: 1 },
      elements: [],
      warnings: ["Arquivo não parece IFC STEP (ISO-10303-21)."],
      notes,
      isDemo: Boolean(opts?.isDemo),
    };
  }

  const schema = detectSchema(cleaned);
  const entities = parseEntities(cleaned);
  if (!entities.size) {
    warnings.push("Nenhuma entidade STEP encontrada.");
  }
  const unit = detectLengthUnit(entities);
  if (unit.name === "assumed_metre") {
    warnings.push("Unidade de comprimento não encontrada — assumindo metros.");
  }
  const projectName = findProjectName(entities);

  const elements: IfcParsedElement[] = [];
  for (const e of entities.values()) {
    if (!TYPE_TO_KIND[e.type]) continue;
    const mapped = mapElement(e, entities, unit);
    if (mapped) elements.push(mapped);
  }

  if (!elements.length) {
    warnings.push(
      "Nenhum IfcSlab/Beam/Column/Wall/Footing encontrado neste arquivo.",
    );
  }

  return {
    ok: elements.length > 0 || entities.size > 0,
    parser: "ts-ifc-step",
    schema,
    projectName,
    unit,
    elements,
    warnings,
    notes,
    isDemo: Boolean(opts?.isDemo),
  };
}
