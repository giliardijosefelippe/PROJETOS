import type { McElementKind } from "../types";
import type { GeoJsonPolygon } from "../geometry";

export type IfcLengthUnit = {
  name: string;
  toMeters: number;
};

export type IfcParsedQuantity = {
  name: string;
  value: number;
  unitHint: "m3" | "m2" | "m" | "unknown";
  origin: string;
};

export type IfcParsedElement = {
  guid: string;
  ifcType: string;
  kind: McElementKind;
  name: string;
  objectType: string | null;
  tag: string | null;
  properties: Record<string, string | number | boolean | null>;
  quantities: IfcParsedQuantity[];
  /** Volume only when present in file quantities — never invented. */
  volumeM3: number | null;
  areaM2: number | null;
  thicknessM: number | null;
  heightM: number | null;
  lengthM: number | null;
  /** Optional 2D footprint in meters when a simple extrusion was parsed. */
  footprint: GeoJsonPolygon | null;
  quantityOrigin: string | null;
  warnings: string[];
};

export type IfcParseResult = {
  ok: boolean;
  parser: "ts-ifc-step";
  schema: string | null;
  projectName: string | null;
  unit: IfcLengthUnit;
  elements: IfcParsedElement[];
  warnings: string[];
  notes: string[];
  isDemo: boolean;
};
