import type { Pt } from "./types";

/** Passo angular dos arcos, em radianos (2°). A integral em trecho reto é exata. */
const ARC_STEP = Math.PI / 90;

export interface Polyline {
  pts: Pt[];
  /** Se verdadeiro, o último ponto liga ao primeiro (contorno fechado). */
  closed: boolean;
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function polylineLength(poly: Polyline): number {
  const { pts, closed } = poly;
  if (pts.length < 2) return 0;
  let sum = 0;
  const n = pts.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) sum += dist(pts[i], pts[(i + 1) % n]);
  return sum;
}

/** Centroide da linha (não da área), ponderado pelo comprimento. */
export function lineCentroid(poly: Polyline): Pt {
  const { pts, closed } = poly;
  const n = pts.length;
  const last = closed ? n : n - 1;
  let length = 0;
  let x = 0;
  let z = 0;
  for (let i = 0; i < last; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const len = dist(a, b);
    length += len;
    x += ((a.x + b.x) / 2) * len;
    z += ((a.z + b.z) / 2) * len;
  }
  if (length === 0) return pts[0] ?? { x: 0, z: 0 };
  return { x: x / length, z: z / length };
}

/**
 * Módulo plástico Wp = ∫|e| dl.
 * `axis` "z" integra |z − origem| (momento em torno de x, excentricidade em z).
 * `axis` "x" integra |x − origem| (momento em torno de z).
 * NBR 6118:2014, item 19.5.2.2.
 */
export function plasticModulus(poly: Polyline, axis: "x" | "z", origin: number): number {
  const { pts, closed } = poly;
  const n = pts.length;
  const last = closed ? n : n - 1;
  let sum = 0;
  for (let i = 0; i < last; i++) {
    sum += segmentWp(pts[i], pts[(i + 1) % n], axis, origin);
  }
  return sum;
}

function segmentWp(a: Pt, b: Pt, axis: "x" | "z", origin: number): number {
  const sa = (axis === "x" ? a.x : a.z) - origin;
  const sb = (axis === "x" ? b.x : b.z) - origin;
  const len = dist(a, b);
  if (len === 0) return 0;
  if (sa === 0 && sb === 0) return 0;
  if (sa * sb >= 0) return ((Math.abs(sa) + Math.abs(sb)) / 2) * len;
  const t = Math.abs(sa) / (Math.abs(sa) + Math.abs(sb));
  return (Math.abs(sa) / 2) * (t * len) + (Math.abs(sb) / 2) * ((1 - t) * len);
}

/** Área do polígono fechado pela polilinha (fecha na borda livre quando aberta). */
export function enclosedArea(poly: Polyline): number {
  const pts = poly.pts;
  if (pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    sum += a.x * b.z - b.x * a.z;
  }
  return Math.abs(sum) / 2;
}

function push(pts: Pt[], p: Pt): void {
  const last = pts[pts.length - 1];
  if (last && Math.abs(last.x - p.x) < 1e-9 && Math.abs(last.z - p.z) < 1e-9) return;
  pts.push(p);
}

function appendArc(pts: Pt[], cx: number, cz: number, r: number, a0: number, a1: number): void {
  if (r <= 1e-9 || Math.abs(a1 - a0) < 1e-9) {
    push(pts, { x: cx + r * Math.cos(a1), z: cz + r * Math.sin(a1) });
    return;
  }
  const sweep = a1 - a0;
  const n = Math.max(1, Math.ceil(Math.abs(sweep) / ARC_STEP));
  for (let i = 0; i <= n; i++) {
    const t = a0 + (sweep * i) / n;
    push(pts, { x: cx + r * Math.cos(t), z: cz + r * Math.sin(t) });
  }
}

export interface Rect {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/**
 * Contorno a uma distância r da face do retângulo, com cantos em quarto de círculo.
 * Recorte opcional pelas bordas livres x = x0 − distX e z = z0 − distZ
 * (a laje ocupa x ≥ x0 − distX e z ≥ z0 − distZ).
 * dist = Infinity significa que não há borda naquele lado.
 */
export function criticalPerimeter(rect: Rect, r: number, distX: number, distZ: number): Polyline {
  const cutX = Number.isFinite(distX) && distX < r - 1e-9;
  const cutZ = Number.isFinite(distZ) && distZ < r - 1e-9;
  if (!cutX && !cutZ) return roundedRect(rect, r);

  if (cutZ && !cutX) return edgeParallelToX(rect, r, distZ);
  if (cutX && !cutZ) return edgeParallelToZ(rect, r, distX);
  return cornerPerimeter(rect, r, distX, distZ);
}

/** Retângulo arredondado fechado. r = 0 degenera no próprio retângulo. */
export function roundedRect(rect: Rect, r: number): Polyline {
  const { x0, x1, z0, z1 } = rect;
  const pts: Pt[] = [];
  if (r <= 1e-9) {
    pts.push({ x: x0, z: z0 }, { x: x1, z: z0 }, { x: x1, z: z1 }, { x: x0, z: z1 });
    return { pts, closed: true };
  }
  // Parte do lado inferior, sentido anti-horário, z para cima.
  push(pts, { x: x0, z: z0 - r });
  push(pts, { x: x1, z: z0 - r });
  appendArc(pts, x1, z0, r, -Math.PI / 2, 0);
  push(pts, { x: x1 + r, z: z1 });
  appendArc(pts, x1, z1, r, 0, Math.PI / 2);
  push(pts, { x: x0, z: z1 + r });
  appendArc(pts, x0, z1, r, Math.PI / 2, Math.PI);
  push(pts, { x: x0 - r, z: z0 });
  appendArc(pts, x0, z0, r, Math.PI, (3 * Math.PI) / 2);
  return { pts, closed: true };
}

/**
 * Borda livre paralela a x, em z = z0 − b, com b < r.
 * O perímetro começa e termina na borda (polilinha aberta).
 */
function edgeParallelToX(rect: Rect, r: number, b: number): Polyline {
  const { x0, x1, z0, z1 } = rect;
  const pts: Pt[] = [];
  const alpha = Math.asin(clamp(b / r, 0, 1));
  // Canto inferior esquerdo: centro (x0, z0), arco de θ = π + α até θ = π
  // (α = 0 quando b = 0: o arco desaparece e o perímetro nasce em (x0 − r, z0)).
  const aCut = Math.PI + alpha;
  push(pts, {
    x: x0 + r * Math.cos(aCut),
    z: z0 + r * Math.sin(aCut),
  });
  appendArc(pts, x0, z0, r, aCut, Math.PI);
  push(pts, { x: x0 - r, z: z1 });
  appendArc(pts, x0, z1, r, Math.PI, Math.PI / 2);
  push(pts, { x: x1, z: z1 + r });
  appendArc(pts, x1, z1, r, Math.PI / 2, 0);
  push(pts, { x: x1 + r, z: z0 });
  appendArc(pts, x1, z0, r, 0, -alpha);
  return { pts, closed: false };
}

/** Borda livre paralela a z, em x = x0 − b, com b < r. */
function edgeParallelToZ(rect: Rect, r: number, b: number): Polyline {
  const { x0, x1, z0, z1 } = rect;
  const pts: Pt[] = [];
  const beta = Math.acos(clamp(b / r, 0, 1));
  // Canto inferior esquerdo: trecho interno de θ = π + β até 3π/2.
  // b = 0 → arco nulo, o perímetro nasce em (x0, z0 − r).
  const aCutBottom = Math.PI + beta;
  push(pts, {
    x: x0 + r * Math.cos(aCutBottom),
    z: z0 + r * Math.sin(aCutBottom),
  });
  appendArc(pts, x0, z0, r, aCutBottom, (3 * Math.PI) / 2);
  push(pts, { x: x1, z: z0 - r });
  appendArc(pts, x1, z0, r, -Math.PI / 2, 0);
  push(pts, { x: x1 + r, z: z1 });
  appendArc(pts, x1, z1, r, 0, Math.PI / 2);
  push(pts, { x: x0, z: z1 + r });
  // Canto superior esquerdo: de θ = π/2 até θ = π − β.
  const aCutTop = Math.PI - beta;
  appendArc(pts, x0, z1, r, Math.PI / 2, aCutTop);
  return { pts, closed: false };
}

/** Duas bordas livres, em x = x0 − bx e z = z0 − bz, ambas cortando o contorno (bx<r ou bz<r). */
function cornerPerimeter(rect: Rect, r: number, bx: number, bz: number): Polyline {
  const { x0, x1, z0, z1 } = rect;
  const pts: Pt[] = [];
  const ax = Math.acos(clamp(bx / Math.max(r, 1e-9), 0, 1));
  const az = Math.asin(clamp(bz / Math.max(r, 1e-9), 0, 1));

  // Começa na borda de baixo (z), no arco inferior direito ou no lado direito,
  // e termina na borda da esquerda (x), no arco superior esquerdo.
  // Lado interno é +x e +z. Cantos externos (inferior esquerdo) saem da laje.
  //
  // Se bz = 0, o arco inferior direito começa em θ = 0? Vamos incluir:
  // - arco inferior direito, do corte em z até θ = 0, depois lado direito, arco superior direito,
  //   lado superior, arco superior esquerdo até o corte em x.
  // O lado inferior e o lado esquerdo ficam de fora quando ambas as bordas cortam.

  // Canto inferior direito, centro (x1, z0). Arco externo de θ = −π/2 (baixo) a θ = 0 (direita).
  // z ≥ z0 − bz ⇒ sin θ ≥ −bz/r. Em [−π/2, 0], sin cresce de −1 a 0.
  // θ_cut = −asin(bz/r). b=0 → θ=0, arco nulo; b→r → θ=−π/2, arco inteiro.
  if (bz < r) {
    const a0 = -az;
    push(pts, { x: x1 + r * Math.cos(a0), z: z0 + r * Math.sin(a0) });
    appendArc(pts, x1, z0, r, a0, 0);
  } else {
    push(pts, { x: x1, z: z0 - r });
    appendArc(pts, x1, z0, r, -Math.PI / 2, 0);
  }
  push(pts, { x: x1 + r, z: z1 });
  appendArc(pts, x1, z1, r, 0, Math.PI / 2);
  push(pts, { x: x0, z: z1 + r });
  // Canto superior esquerdo até a borda x.
  // θ de π/2 até π − acos(bx/r). bx=0 → arco nulo em θ=π/2; bx→r → até θ=π.
  if (bx < r) {
    const a1 = Math.PI - ax;
    appendArc(pts, x0, z1, r, Math.PI / 2, a1);
  } else {
    appendArc(pts, x0, z1, r, Math.PI / 2, Math.PI);
    push(pts, { x: x0 - r, z: z0 });
  }
  return { pts, closed: false };
}

/**
 * Perímetro reduzido u* de pilar de borda, item 19.5.2.
 * a = min(1,5d; 0,5 C1), C1 perpendicular à borda.
 * Comprimento: C2 + 2a + π r, com r a distância à face (0 em C, 2d em C', p+2d em C'').
 * A polilinha é aberta: dois ramos de comprimento a, um semicírculo e o lado interno.
 */
export function reducedEdge(
  rect: Rect,
  r: number,
  a: number,
  parallel: "x" | "z",
): Polyline {
  if (parallel === "x") {
    // Borda paralela a x: C2 = largura em x, C1 = dimensão em z, interior em +z.
    const cPar0 = rect.x0;
    const cPar1 = rect.x1;
    const cPerpInner = rect.z1;
    const pts: Pt[] = [];
    // Ramo esquerdo, de z = face interna − a até a face interna, em x = x0 − r.
    push(pts, { x: cPar0 - r, z: cPerpInner - a });
    push(pts, { x: cPar0 - r, z: cPerpInner });
    appendArc(pts, cPar0, cPerpInner, r, Math.PI, Math.PI / 2);
    push(pts, { x: cPar1, z: cPerpInner + r });
    appendArc(pts, cPar1, cPerpInner, r, Math.PI / 2, 0);
    push(pts, { x: cPar1 + r, z: cPerpInner - a });
    return { pts, closed: false };
  }
  // Borda paralela a z: interior em +x. C2 ao longo de z, C1 ao longo de x.
  const cPerpInner = rect.x1;
  const pts: Pt[] = [];
  push(pts, { x: cPerpInner - a, z: rect.z0 - r });
  push(pts, { x: cPerpInner, z: rect.z0 - r });
  appendArc(pts, cPerpInner, rect.z0, r, -Math.PI / 2, 0);
  push(pts, { x: cPerpInner + r, z: rect.z1 });
  appendArc(pts, cPerpInner, rect.z1, r, 0, Math.PI / 2);
  push(pts, { x: cPerpInner - a, z: rect.z1 + r });
  return { pts, closed: false };
}

/**
 * Perímetro reduzido u* de pilar de canto.
 * Ramos aX = min(1,5d; 0,5 cx) e aZ = min(1,5d; 0,5 cz), mais um quarto de círculo.
 * Comprimento: aX + aZ + (π/2) r.
 */
export function reducedCorner(rect: Rect, r: number, aX: number, aZ: number): Polyline {
  const pts: Pt[] = [];
  const { x1, z1 } = rect;
  // Ramo paralelo a z (em x = x1 + r), comprimento aZ, da face interna para trás.
  push(pts, { x: x1 + r, z: z1 - aZ });
  push(pts, { x: x1 + r, z: z1 });
  appendArc(pts, x1, z1, r, 0, Math.PI / 2);
  // Ramo paralelo a x (em z = z1 + r), comprimento aX.
  push(pts, { x: x1 - aX, z: z1 + r });
  return { pts, closed: false };
}

/**
 * Linha de armadura paralela ao contorno, a uma distância s da face.
 * Usa o mesmo recorte de borda do perímetro crítico.
 */
export function reinforcementLine(rect: Rect, s: number, distX: number, distZ: number): Polyline {
  return criticalPerimeter(rect, s, distX, distZ);
}

export interface ContourPart {
  /** Reta: paralela à face. Diagonal: arco do canto. */
  kind: "reta" | "diagonal";
  length: number;
  at: (t: number) => Pt;
  tangent: (t: number) => Pt;
}

/**
 * Mesmo contorno de `criticalPerimeter`, separado em trechos retos e diagonais
 * para posicionar as peças da armadura de punção.
 */
export function contourParts(rect: Rect, r: number, distX: number, distZ: number): ContourPart[] {
  const cutX = Number.isFinite(distX) && distX < r - 1e-9;
  const cutZ = Number.isFinite(distZ) && distZ < r - 1e-9;
  if (!cutX && !cutZ) return roundedParts(rect, r);
  if (cutZ && !cutX) return edgeXParts(rect, r, distZ);
  if (cutX && !cutZ) return edgeZParts(rect, r, distX);
  return cornerParts(rect, r, distX, distZ);
}

function linePart(a: Pt, b: Pt, kind: ContourPart["kind"]): ContourPart | null {
  const length = dist(a, b);
  if (length < 1e-6) return null;
  const tx = (b.x - a.x) / length;
  const tz = (b.z - a.z) / length;
  return {
    kind,
    length,
    at: (t) => ({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t }),
    tangent: () => ({ x: tx, z: tz }),
  };
}

function arcPart(cx: number, cz: number, r: number, a0: number, a1: number): ContourPart | null {
  const sweep = a1 - a0;
  const length = Math.abs(sweep) * r;
  if (length < 1e-6 || r <= 1e-9) return null;
  const dir = sweep >= 0 ? 1 : -1;
  return {
    kind: "diagonal",
    length,
    at: (t) => {
      const a = a0 + sweep * t;
      return { x: cx + r * Math.cos(a), z: cz + r * Math.sin(a) };
    },
    tangent: (t) => {
      const a = a0 + sweep * t;
      return { x: -Math.sin(a) * dir, z: Math.cos(a) * dir };
    },
  };
}

function keep(parts: Array<ContourPart | null>): ContourPart[] {
  return parts.filter((p): p is ContourPart => p !== null);
}

function roundedParts(rect: Rect, r: number): ContourPart[] {
  const { x0, x1, z0, z1 } = rect;
  if (r <= 1e-9) {
    return keep([
      linePart({ x: x0, z: z0 }, { x: x1, z: z0 }, "reta"),
      linePart({ x: x1, z: z0 }, { x: x1, z: z1 }, "reta"),
      linePart({ x: x1, z: z1 }, { x: x0, z: z1 }, "reta"),
      linePart({ x: x0, z: z1 }, { x: x0, z: z0 }, "reta"),
    ]);
  }
  return keep([
    linePart({ x: x0, z: z0 - r }, { x: x1, z: z0 - r }, "reta"),
    arcPart(x1, z0, r, -Math.PI / 2, 0),
    linePart({ x: x1 + r, z: z0 }, { x: x1 + r, z: z1 }, "reta"),
    arcPart(x1, z1, r, 0, Math.PI / 2),
    linePart({ x: x1, z: z1 + r }, { x: x0, z: z1 + r }, "reta"),
    arcPart(x0, z1, r, Math.PI / 2, Math.PI),
    linePart({ x: x0 - r, z: z1 }, { x: x0 - r, z: z0 }, "reta"),
    arcPart(x0, z0, r, Math.PI, (3 * Math.PI) / 2),
  ]);
}

function edgeXParts(rect: Rect, r: number, b: number): ContourPart[] {
  const { x0, x1, z0, z1 } = rect;
  const alpha = Math.asin(clamp(b / r, 0, 1));
  return keep([
    arcPart(x0, z0, r, Math.PI + alpha, Math.PI),
    linePart({ x: x0 - r, z: z0 }, { x: x0 - r, z: z1 }, "reta"),
    arcPart(x0, z1, r, Math.PI, Math.PI / 2),
    linePart({ x: x0, z: z1 + r }, { x: x1, z: z1 + r }, "reta"),
    arcPart(x1, z1, r, Math.PI / 2, 0),
    linePart({ x: x1 + r, z: z1 }, { x: x1 + r, z: z0 }, "reta"),
    arcPart(x1, z0, r, 0, -alpha),
  ]);
}

function edgeZParts(rect: Rect, r: number, b: number): ContourPart[] {
  const { x0, x1, z0, z1 } = rect;
  const beta = Math.acos(clamp(b / r, 0, 1));
  return keep([
    arcPart(x0, z0, r, Math.PI + beta, (3 * Math.PI) / 2),
    linePart({ x: x0, z: z0 - r }, { x: x1, z: z0 - r }, "reta"),
    arcPart(x1, z0, r, -Math.PI / 2, 0),
    linePart({ x: x1 + r, z: z0 }, { x: x1 + r, z: z1 }, "reta"),
    arcPart(x1, z1, r, 0, Math.PI / 2),
    linePart({ x: x1, z: z1 + r }, { x: x0, z: z1 + r }, "reta"),
    arcPart(x0, z1, r, Math.PI / 2, Math.PI - beta),
  ]);
}

function cornerParts(rect: Rect, r: number, bx: number, bz: number): ContourPart[] {
  const { x0, x1, z0, z1 } = rect;
  const ax = Math.acos(clamp(bx / Math.max(r, 1e-9), 0, 1));
  const az = Math.asin(clamp(bz / Math.max(r, 1e-9), 0, 1));
  return keep([
    arcPart(x1, z0, r, bz < r ? -az : -Math.PI / 2, 0),
    linePart({ x: x1 + r, z: z0 }, { x: x1 + r, z: z1 }, "reta"),
    arcPart(x1, z1, r, 0, Math.PI / 2),
    linePart({ x: x1, z: z1 + r }, { x: x0, z: z1 + r }, "reta"),
    arcPart(x0, z1, r, Math.PI / 2, bx < r ? Math.PI - ax : Math.PI),
    bx < r ? null : linePart({ x: x0 - r, z: z1 }, { x: x0 - r, z: z0 }, "reta"),
  ]);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Wp fechado do pilar interno, r = distância da face ao contorno.
 * Para r = 2d reproduz a expressão da NBR 6118:2014, item 19.5.2.2:
 * Wp = C1²/2 + C1·C2 + 4·C2·d + 16·d² + 2·π·d·C1.
 */
export function wpInteriorClosed(c1: number, c2: number, r: number): number {
  return (c1 * c1) / 2 + c1 * c2 + 2 * r * c2 + Math.PI * r * c1 + 4 * r * r;
}

/** Área interna do retângulo arredondado. */
export function areaRoundedRect(cx: number, cz: number, r: number): number {
  return (cx + 2 * r) * (cz + 2 * r) - (4 - Math.PI) * r * r;
}
