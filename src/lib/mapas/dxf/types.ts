import type { Point } from "../geometry";

export type DxfLayerInfo = {
  name: string;
  color: number | null;
  frozen: boolean;
  off: boolean;
};

export type DxfEntityKind =
  | "LINE"
  | "LWPOLYLINE"
  | "POLYLINE"
  | "CIRCLE"
  | "ARC"
  | "INSERT"
  | "TEXT"
  | "OTHER";

export type DxfRawEntity = {
  type: DxfEntityKind | string;
  layer: string;
  handle: string | null;
  /** Drawing units (pre-scale) */
  points: Point[];
  closed?: boolean;
  radius?: number;
  startAngleDeg?: number;
  endAngleDeg?: number;
  blockName?: string;
  insert?: {
    x: number;
    y: number;
    xScale: number;
    yScale: number;
    rotationDeg: number;
  };
  text?: string;
};

export type CadGeometryKind = "LineString" | "Polygon" | "Point" | "MultiLineString";

export type CadEntity = {
  id: string;
  layer: string;
  sourceType: string;
  handle: string | null;
  geometryKind: CadGeometryKind;
  /** Coordinates in meters (internal model) */
  coordinates: number[] | number[][] | number[][][];
  warnings: string[];
  isDemo?: boolean;
};

export type CadLayer = {
  name: string;
  colorAci: number | null;
  visible: boolean;
  frozen: boolean;
  entityCount: number;
};

export type CadModel = {
  sourceFormat: "dxf";
  parser: "ts-ascii" | "ezdxf" | "oda+ezdxf";
  isDemo: boolean;
  units: {
    insunits: number | null;
    label: string;
    toMeters: number;
  };
  layers: CadLayer[];
  entities: CadEntity[];
  blocks: string[];
  warnings: string[];
  bboxMeters: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  } | null;
};
