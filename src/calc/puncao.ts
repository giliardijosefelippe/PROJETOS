import {
  areaRoundedRect,
  criticalPerimeter,
  enclosedArea,
  lineCentroid,
  plasticModulus,
  polylineLength,
  reducedCorner,
  reducedEdge,
  reinforcementLine,
  wpInteriorClosed,
  type Polyline,
  type Rect,
} from "./geometry";
import { layoutBars } from "./armadura";
import { fmt, fmtRho } from "./format";
import type {
  BarLayout,
  DrawModel,
  PunchingInput,
  PunchingResult,
  ReportBlock,
  ReportLine,
  WarningItem,
} from "./types";

export const GAMMA_S = 1.15;
export const BITOLAS_MM = [5, 6.3, 8, 10, 12.5, 16, 20, 25] as const;

export const EDITION_NOTE =
  "ABNT NBR 6118:2014, seção 19.5, com os limites ρ ≤ 0,02 e k ≤ 2 do item 19.5.3.2 da edição de 2023. Itens cuja alteração em 2023 não foi confirmada no texto publicado permanecem na redação de 2014.";

const PREMISSAS = [
  "Laje maciça lisa e pilar retangular. Fora desta versão: protensão, capitel, ábaco (drop panel), pilar não retangular e laje apoiada no solo.",
  "Aberturas não são descontadas. Pelo item 19.5.2.6, abertura a menos de 8d do contorno C exigiria retirar de C' o trecho entre as tangentes que passam pelo centro da área carregada; isso não foi implementado.",
  "A armadura paralela a x é a camada externa e a paralela a z é a interna. d = (dx + dz) / 2, como na definição de altura útil ao longo de C' (19.5.2).",
  "ρx e ρz usam a armadura uniforme em cm²/m. Com distribuição uniforme, a faixa de largura do pilar acrescida de 3d para cada lado (19.5.3.2) não altera a taxa. Junto à borda, a norma limita essa faixa à borda; a taxa informada já é a da região.",
  "σcp = 0. A parcela 0,10·σcp de 19.5.3.2, devida à protensão, não entra.",
  "A majoração de 20% de τRd2 (19.5.3.1), possível em pilar interno com vãos que não diferem de mais de 50% e sem aberturas, não é aplicada: os vãos não são dados. O resultado fica a favor da segurança.",
  "No contorno C, τSd = FSd / (u0·d), sem parcela de momento (19.5.3.1). u0 é o perímetro das faces do pilar em contato com a laje. A redução a = min(1,5d; 0,5 C1) vale para u* nas verificações de C' e C'' (19.5.2), não para a compressão diagonal.",
  "Wp de pilar interno usa a expressão fechada de 19.5.2.2. Em borda e canto, Wp = ∫|e| dl sobre o perímetro u (o geométrico), com o eixo passando pelo centro do pilar, que é a definição do mesmo item. u* entra na parcela da força e na excentricidade e*.",
  "Armadura contra colapso progressivo (19.5.4) não é dimensionada.",
  "γs = 1,15. Para estribos, fywd segue a limitação com a espessura da laje do item 19.4.2 (250 MPa até 15 cm e 435 MPa a partir de 35 cm, interpolação linear). Para studs, fywd ≤ 300 MPa (19.5.3.3), além do limite de 19.4.2.",
  "As peças são desenhadas em contornos paralelos a C', na parte reta e na diagonal dos cantos, em raios a partir do pilar (19.5.3.3 e item 20.4). sr ≤ 0,75d e a primeira linha a ≤ 0,5d. A norma não publica outro número para o espaçamento ao longo do contorno; na linha mais externa essa distância também fica ≤ 0,75d. Cada stud é uma peça. Cada estribo é uma peça com duas pernas.",
];

export const defaultInput: PunchingInput = {
  cx: 50,
  cz: 50,
  position: "interno",
  edgeAxis: "x",
  distZ: 0,
  distX: 0,
  h: 25,
  fck: 30,
  gammaC: 1.4,
  cobrimento: 2.5,
  fyk: 500,
  bitola: 12.5,
  asx: 12,
  asz: 12,
  punchingOn: false,
  punchingType: "studs",
  asw: 8,
  sr: 12,
  angulo: 90,
  nLinhas: 4,
  s0: 10,
  bitolaW: 8,
  loadMode: "calculo",
  fSd: 660,
  mSdx: 40,
  mSdz: 25,
  fK: 470,
  mKx: 28,
  mKz: 18,
  gammaF: 1.4,
  bothSigns: true,
  uniformOn: false,
  q: 8,
  reportLevel: "completo",
};

type Model = "interno" | "borda" | "canto";

interface Geom {
  rect: Rect;
  model: Model;
  edgeParallel: "x" | "z";
  distX: number;
  distZ: number;
  cx: number;
  cz: number;
  /** Aviso quando a posição pedida não corta C'. */
  positionNote: string | null;
}

interface Stress {
  tau: number;
  tauForce: number;
  tauM1: number;
  tauM2: number;
  uUsed: number;
  uFull: number;
  wp1: number;
  wp2: number;
  k1: number;
  k2: number;
  ratio1: number;
  ratio2: number;
  outside1: boolean;
  outside2: boolean;
  eStar: number | null;
  mStar: number | null;
  mSd1: number | null;
  floored: boolean;
  cornerBy: "x" | "z" | null;
}

/** Tabela 19.2 da NBR 6118:2014. Fora de 0,5 a 3,0 limita-se ao extremo, sem extrapolar. */
export function kFromRatio(ratio: number): { k: number; outside: boolean } {
  if (!Number.isFinite(ratio) || ratio <= 0) return { k: 0.45, outside: true };
  const pts: Array<[number, number]> = [
    [0.5, 0.45],
    [1, 0.6],
    [2, 0.7],
    [3, 0.8],
  ];
  if (ratio < 0.5 - 1e-12) return { k: 0.45, outside: true };
  if (ratio > 3 + 1e-12) return { k: 0.8, outside: true };
  for (let i = 0; i < pts.length - 1; i++) {
    const [r0, k0] = pts[i];
    const [r1, k1] = pts[i + 1];
    if (ratio <= r1 + 1e-12) {
      const t = (ratio - r0) / (r1 - r0);
      return { k: k0 + t * (k1 - k0), outside: false };
    }
  }
  return { k: 0.8, outside: false };
}

export function effectiveDepth(h: number, cover: number, bitolaMm: number): { dx: number; dz: number; d: number; phi: number } {
  const phi = bitolaMm / 10;
  const dx = h - cover - phi / 2;
  const dz = h - cover - phi - phi / 2;
  return { dx, dz, d: (dx + dz) / 2, phi };
}

/** Item 19.4.2 e teto de 300 MPa para studs no item 19.5.3.3. h em cm, resultado em MPa. */
export function fywdEffective(hCm: number, fyk: number, type: "estribos" | "studs"): { fywd: number; fyd: number } {
  const fyd = fyk / GAMMA_S;
  let byThickness: number;
  if (hCm <= 15) byThickness = 250;
  else if (hCm >= 35) byThickness = 435;
  else byThickness = 250 + ((435 - 250) * (hCm - 15)) / (35 - 15);
  const cap = type === "studs" ? 300 : 435;
  return { fywd: Math.min(fyd, byThickness, cap), fyd };
}

export function tauRd2(fck: number, gammaC: number): { tau: number; fcd: number; alphaV: number } {
  const fcd = fck / gammaC;
  const alphaV = 1 - fck / 250;
  return { tau: 0.27 * alphaV * fcd, fcd, alphaV };
}

/** Item 19.5.3.2. d em cm, ρ adimensional, fck em MPa, resultado em MPa. σcp = 0. */
export function tauRd1(dCm: number, rho: number, fck: number): { tau: number; k: number; rhoUsed: number; kCapped: boolean; rhoCapped: boolean } {
  let k = 1 + Math.sqrt(20 / dCm);
  const kCapped = k > 2;
  if (k > 2) k = 2;
  const rhoCapped = rho > 0.02;
  const rhoUsed = Math.min(Math.max(rho, 0), 0.02);
  const tau = 0.13 * k * Math.cbrt(100 * rhoUsed * fck);
  return { tau, k, rhoUsed, kCapped, rhoCapped };
}

/** Parcela de concreto de τRd3, item 19.5.3.3: coeficiente 0,10 no lugar de 0,13. */
export function tauConcreteRd3(k: number, rhoUsed: number, fck: number): number {
  return 0.1 * k * Math.cbrt(100 * rhoUsed * fck);
}

/**
 * Segunda parcela de τRd3, em MPa.
 * Asw em cm², fywd em MPa, sr e u em cm, α em radianos.
 * 1,5 · (d/sr) · (Asw · fywd · sen α) / (u · d) = 1,5 · Asw · fywd · sen α / (sr · u).
 */
export function tauSteel(aswCm2: number, fywd: number, srCm: number, uCm: number, alphaRad: number): number {
  const sin = Math.sin(alphaRad);
  if (srCm <= 0 || uCm <= 0 || sin <= 0) return 0;
  return (1.5 * aswCm2 * fywd * sin) / (srCm * uCm);
}

export function aswOverSrRequired(deltaTau: number, uCm: number, fywd: number, alphaRad: number): number {
  const sin = Math.sin(alphaRad);
  if (deltaTau <= 0 || fywd <= 0 || sin <= 0) return 0;
  return (deltaTau * uCm) / (1.5 * fywd * sin);
}

function tauForce(fKn: number, uCm: number, dCm: number): number {
  return (10 * fKn) / (uCm * dCm);
}

function tauMoment(k: number, mKnm: number, wpCm2: number, dCm: number): number {
  if (wpCm2 <= 0 || dCm <= 0 || mKnm === 0) return 0;
  return (10 * k * Math.abs(mKnm) * 100) / (wpCm2 * dCm);
}

function contactU0(geom: Geom): number {
  const { cx, cz, model, edgeParallel, distX, distZ } = geom;
  if (model === "interno") return 2 * (cx + cz);
  if (model === "borda") {
    if (edgeParallel === "x") {
      return distZ <= 1e-9 ? cx + 2 * cz : 2 * (cx + cz);
    }
    return distX <= 1e-9 ? cz + 2 * cx : 2 * (cx + cz);
  }
  let u = 0;
  u += cz;
  u += cx;
  if (distX > 1e-9) u += cz;
  if (distZ > 1e-9) u += cx;
  return u;
}

function resolveGeom(input: PunchingInput, d: number): Geom {
  const { cx, cz } = input;
  const r = 2 * d;
  if (input.position === "interno") {
    return {
      rect: { x0: -cx / 2, x1: cx / 2, z0: -cz / 2, z1: cz / 2 },
      model: "interno",
      edgeParallel: "x",
      distX: Number.POSITIVE_INFINITY,
      distZ: Number.POSITIVE_INFINITY,
      cx,
      cz,
      positionNote: null,
    };
  }
  if (input.position === "borda") {
    const parallel = input.edgeAxis;
    if (parallel === "x") {
      const cuts = input.distZ < r - 1e-9;
      return {
        rect: { x0: -cx / 2, x1: cx / 2, z0: 0, z1: cz },
        model: cuts ? "borda" : "interno",
        edgeParallel: "x",
        distX: Number.POSITIVE_INFINITY,
        distZ: cuts ? input.distZ : Number.POSITIVE_INFINITY,
        cx,
        cz,
        positionNote: cuts
          ? null
          : "A borda livre está a 2d ou mais da face do pilar, então C' não é cortado. A verificação usou o contorno de pilar interno.",
      };
    }
    const cuts = input.distX < r - 1e-9;
    return {
      rect: { x0: 0, x1: cx, z0: -cz / 2, z1: cz / 2 },
      model: cuts ? "borda" : "interno",
      edgeParallel: "z",
      distX: cuts ? input.distX : Number.POSITIVE_INFINITY,
      distZ: Number.POSITIVE_INFINITY,
      cx,
      cz,
      positionNote: cuts
        ? null
        : "A borda livre está a 2d ou mais da face do pilar, então C' não é cortado. A verificação usou o contorno de pilar interno.",
    };
  }
  const cutX = input.distX < r - 1e-9;
  const cutZ = input.distZ < r - 1e-9;
  const rect = { x0: 0, x1: cx, z0: 0, z1: cz };
  if (cutX && cutZ) {
    return {
      rect,
      model: "canto",
      edgeParallel: "x",
      distX: input.distX,
      distZ: input.distZ,
      cx,
      cz,
      positionNote: null,
    };
  }
  if (cutZ && !cutX) {
    return {
      rect,
      model: "borda",
      edgeParallel: "x",
      distX: Number.POSITIVE_INFINITY,
      distZ: input.distZ,
      cx,
      cz,
      positionNote:
        "Só a borda paralela a x corta C'. A outra face está a 2d ou mais, e a verificação seguiu o pilar de borda nessa face.",
    };
  }
  if (cutX && !cutZ) {
    return {
      rect,
      model: "borda",
      edgeParallel: "z",
      distX: input.distX,
      distZ: Number.POSITIVE_INFINITY,
      cx,
      cz,
      positionNote:
        "Só a borda paralela a z corta C'. A outra face está a 2d ou mais, e a verificação seguiu o pilar de borda nessa face.",
    };
  }
  return {
    rect: { x0: -cx / 2, x1: cx / 2, z0: -cz / 2, z1: cz / 2 },
    model: "interno",
    edgeParallel: "x",
    distX: Number.POSITIVE_INFINITY,
    distZ: Number.POSITIVE_INFINITY,
    cx,
    cz,
    positionNote:
      "As duas bordas livres estão a 2d ou mais da face do pilar. C' não é cortado e a verificação usou o contorno de pilar interno.",
  };
}

function fullPoly(geom: Geom, r: number): Polyline {
  return criticalPerimeter(geom.rect, r, geom.distX, geom.distZ);
}

function areaOf(poly: Polyline, geom: Geom, r: number): number {
  if (geom.model === "interno" && poly.closed) return areaRoundedRect(geom.cx, geom.cz, r);
  return enclosedArea(poly);
}

function interiorU(cx: number, cz: number, r: number): number {
  return 2 * (cx + cz) + 2 * Math.PI * r;
}

function stressAt(geom: Geom, r: number, d: number, fKn: number, mX: number, mZ: number): Stress {
  const poly = fullPoly(geom, r);
  const uFull = geom.model === "interno" && poly.closed ? interiorU(geom.cx, geom.cz, r) : polylineLength(poly);
  const center = columnCenter(geom);

  if (geom.model === "interno") {
    const ratioZ = geom.cz / geom.cx;
    const ratioX = geom.cx / geom.cz;
    const kz = kFromRatio(ratioZ);
    const kx = kFromRatio(ratioX);
    const wpZ = wpInteriorClosed(geom.cz, geom.cx, r);
    const wpX = wpInteriorClosed(geom.cx, geom.cz, r);
    const tF = tauForce(fKn, uFull, d);
    const tZ = tauMoment(kz.k, mX, wpZ, d);
    const tX = tauMoment(kx.k, mZ, wpX, d);
    return {
      tau: tF + tZ + tX,
      tauForce: tF,
      tauM1: tZ,
      tauM2: tX,
      uUsed: uFull,
      uFull,
      wp1: wpZ,
      wp2: wpX,
      k1: kz.k,
      k2: kx.k,
      ratio1: ratioZ,
      ratio2: ratioX,
      outside1: kz.outside,
      outside2: kx.outside,
      eStar: null,
      mStar: null,
      mSd1: null,
      floored: false,
      cornerBy: null,
    };
  }

  if (geom.model === "borda") {
    const parallelX = geom.edgeParallel === "x";
    const c1 = parallelX ? geom.cz : geom.cx;
    const c2 = parallelX ? geom.cx : geom.cz;
    const a = Math.min(1.5 * d, 0.5 * c1);
    const reduced = reducedEdge(geom.rect, r, a, geom.edgeParallel);
    const uStar = polylineLength(reduced);
    const cen = lineCentroid(reduced);
    const eStar = parallelX ? cen.z - center.z : cen.x - center.x;
    const mStar = fKn * (eStar / 100);
    const mPerp = parallelX ? mX : mZ;
    const mPar = parallelX ? mZ : mX;
    const raw = mPerp - mStar;
    const floored = raw < -1e-9;
    const mSd1 = Math.max(raw, 0);
    const k1 = kFromRatio(c1 / c2);
    const k2 = kFromRatio(c2 / (2 * c1));
    const wpPerp = plasticModulus(poly, parallelX ? "z" : "x", parallelX ? center.z : center.x);
    const wpPar = plasticModulus(poly, parallelX ? "x" : "z", parallelX ? center.x : center.z);
    const tF = tauForce(fKn, uStar, d);
    const t1 = tauMoment(k1.k, mSd1, wpPerp, d);
    const t2 = tauMoment(k2.k, mPar, wpPar, d);
    return {
      tau: tF + t1 + t2,
      tauForce: tF,
      tauM1: t1,
      tauM2: t2,
      uUsed: uStar,
      uFull,
      wp1: wpPerp,
      wp2: wpPar,
      k1: k1.k,
      k2: k2.k,
      ratio1: c1 / c2,
      ratio2: c2 / (2 * c1),
      outside1: k1.outside,
      outside2: k2.outside,
      eStar,
      mStar,
      mSd1,
      floored,
      cornerBy: null,
    };
  }

  const aX = Math.min(1.5 * d, 0.5 * geom.cx);
  const aZ = Math.min(1.5 * d, 0.5 * geom.cz);
  const reduced = reducedCorner(geom.rect, r, aX, aZ);
  const uStar = polylineLength(reduced);
  const cen = lineCentroid(reduced);
  const eZ = cen.z - center.z;
  const eX = cen.x - center.x;
  const wpZ = plasticModulus(poly, "z", center.z);
  const wpX = plasticModulus(poly, "x", center.x);
  const tF = tauForce(fKn, uStar, d);

  const sideZ = cornerSide(fKn, mX, eZ, geom.cz, geom.cx, wpZ, d, tF);
  const sideX = cornerSide(fKn, mZ, eX, geom.cx, geom.cz, wpX, d, tF);
  const useZ = sideZ.tau >= sideX.tau;
  const side = useZ ? sideZ : sideX;
  return {
    tau: side.tau,
    tauForce: tF,
    tauM1: side.tauM,
    tauM2: 0,
    uUsed: uStar,
    uFull,
    wp1: useZ ? wpZ : wpX,
    wp2: useZ ? wpX : wpZ,
    k1: side.k,
    k2: useZ ? sideX.k : sideZ.k,
    ratio1: side.ratio,
    ratio2: useZ ? sideX.ratio : sideZ.ratio,
    outside1: side.outside,
    outside2: useZ ? sideX.outside : sideZ.outside,
    eStar: useZ ? eZ : eX,
    mStar: useZ ? sideZ.mStar : sideX.mStar,
    mSd1: side.mSd1,
    floored: side.floored,
    cornerBy: useZ ? "z" : "x",
  };
}

function cornerSide(
  fKn: number,
  mPerp: number,
  eStar: number,
  c1: number,
  c2: number,
  wp: number,
  d: number,
  tauF: number,
): { tau: number; tauM: number; k: number; ratio: number; outside: boolean; mStar: number; mSd1: number; floored: boolean } {
  const mStar = fKn * (eStar / 100);
  const raw = mPerp - mStar;
  const floored = raw < -1e-9;
  const mSd1 = Math.max(raw, 0);
  const ratio = c1 / c2;
  const k = kFromRatio(ratio);
  const tauM = tauMoment(k.k, mSd1, wp, d);
  return { tau: tauF + tauM, tauM, k: k.k, ratio, outside: k.outside, mStar, mSd1, floored };
}

function columnCenter(geom: Geom): { x: number; z: number } {
  return { x: (geom.rect.x0 + geom.rect.x1) / 2, z: (geom.rect.z0 + geom.rect.z1) / 2 };
}

function reduceForce(f: number, areaCm2: number, qSd: number, on: boolean): { force: number; delta: number } {
  if (!on || qSd === 0) return { force: f, delta: 0 };
  const delta = qSd * (areaCm2 / 10_000);
  const force = Math.max(0, f - delta);
  return { force, delta: f - force };
}

interface MomentCase {
  mX: number;
  mZ: number;
  label: string;
}

function momentCases(mX: number, mZ: number, both: boolean): MomentCase[] {
  if (!both) return [{ mX, mZ, label: "sinais informados" }];
  const ax = Math.abs(mX);
  const az = Math.abs(mZ);
  const out: MomentCase[] = [];
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      out.push({
        mX: sx * ax,
        mZ: sz * az,
        label: `MSd,x ${sx > 0 ? "+" : "−"}${fmt(ax, 2)} e MSd,z ${sz > 0 ? "+" : "−"}${fmt(az, 2)}`,
      });
    }
  }
  return out;
}

function line(label: string, value?: string, formula?: string, substitution?: string): ReportLine {
  return { label, value, formula, substitution };
}

export function calculate(input: PunchingInput): PunchingResult {
  const warnings: WarningItem[] = [];
  const fail = (error: string): PunchingResult => ({
    ...emptyResult(input),
    ok: false,
    error,
    warnings: [{ severity: "erro", text: error }],
  });

  if (input.cx <= 0 || input.cz <= 0) return fail("As dimensões do pilar devem ser positivas.");
  if (input.h <= 0) return fail("A espessura da laje deve ser positiva.");
  if (input.fck <= 0 || input.gammaC <= 0) return fail("fck e γc devem ser positivos.");
  if (input.fyk <= 0) return fail("fyk deve ser positivo.");
  if (input.bitola <= 0) return fail("A bitola deve ser positiva.");
  if (input.asx < 0 || input.asz < 0) return fail("A armadura de flexão não pode ser negativa.");
  if (input.cobrimento < 0) return fail("O cobrimento não pode ser negativo.");
  if (input.loadMode === "caracteristico" && input.gammaF <= 0) return fail("γf deve ser positivo.");

  const depth = effectiveDepth(input.h, input.cobrimento, input.bitola);
  if (depth.d <= 0 || depth.dx <= 0 || depth.dz <= 0) {
    return fail("A altura útil ficou nula ou negativa. Aumente h ou reduza o cobrimento e a bitola.");
  }
  const { d, dx, dz, phi } = depth;

  const rhoX = input.asx / (100 * dx);
  const rhoZ = input.asz / (100 * dz);
  const rho = Math.sqrt(Math.max(rhoX, 0) * Math.max(rhoZ, 0));
  const rd1 = tauRd1(d, rho, input.fck);
  const rd2 = tauRd2(input.fck, input.gammaC);
  const conc3 = tauConcreteRd3(rd1.k, rd1.rhoUsed, input.fck);
  if (rd1.kCapped) warnings.push({ severity: "aviso", text: "k = 1 + √(20/d) ultrapassou 2 e foi limitado a 2 (19.5.3.2)." });
  if (rd1.rhoCapped) warnings.push({ severity: "aviso", text: "ρ ultrapassou 0,02 e foi limitado a 0,02 (19.5.3.2)." });
  if (rho === 0) warnings.push({ severity: "aviso", text: "ρ = 0. Sem armadura de flexão aderente, τRd1 é nulo." });
  if (rd2.alphaV <= 0) warnings.push({ severity: "erro", text: "αv = 1 − fck/250 ficou nulo ou negativo. Revise fck." });

  const fDesign = input.loadMode === "calculo" ? input.fSd : input.gammaF * input.fK;
  const mXDesign = input.loadMode === "calculo" ? input.mSdx : input.gammaF * input.mKx;
  const mZDesign = input.loadMode === "calculo" ? input.mSdz : input.gammaF * input.mKz;
  const qSd = input.uniformOn ? (input.loadMode === "calculo" ? input.q : input.gammaF * input.q) : 0;
  if (fDesign < 0) warnings.push({ severity: "aviso", text: "FSd negativo foi mantido no memorial; a punção usa o valor informado." });

  const geom = resolveGeom(input, d);
  if (geom.positionNote) warnings.push({ severity: "aviso", text: geom.positionNote });

  const u0 = contactU0(geom);
  const areaC = input.cx * input.cz;
  const atC = reduceForce(fDesign, areaC, qSd, input.uniformOn);
  const tauC = u0 > 0 && d > 0 ? tauForce(atC.force, u0, d) : Number.POSITIVE_INFINITY;

  const polyCp = fullPoly(geom, 2 * d);
  const areaCp = areaOf(polyCp, geom, 2 * d);
  const atCp = reduceForce(fDesign, areaCp, qSd, input.uniformOn);

  const cases = momentCases(mXDesign, mZDesign, input.bothSigns);
  let best = stressAt(geom, 2 * d, d, atCp.force, cases[0].mX, cases[0].mZ);
  let bestLabel = cases[0].label;
  let bestMX = cases[0].mX;
  let bestMZ = cases[0].mZ;
  for (const c of cases.slice(1)) {
    const s = stressAt(geom, 2 * d, d, atCp.force, c.mX, c.mZ);
    if (s.tau > best.tau + 1e-12) {
      best = s;
      bestLabel = c.label;
      bestMX = c.mX;
      bestMZ = c.mZ;
    }
  }
  if (best.outside1 || best.outside2) {
    warnings.push({
      severity: "aviso",
      text: "C1/C2 ficou fora do intervalo 0,5 a 3,0 da Tabela 19.2. K foi limitado ao valor extremo da tabela, sem extrapolação.",
    });
  }
  if (best.floored) {
    warnings.push({
      severity: "aviso",
      text: "M* = FSd·e* supera o momento aplicado neste sinal. O item 19.5.2 escreve MSd1 = (MSd − M*) ≥ 0: o termo de momento não foi extrapolado para valor negativo e ficou em zero.",
    });
  }

  const passesCompression = tauC <= rd2.tau + 1e-9 && rd2.alphaV > 0;
  const passesUnreinforced = best.tau <= rd1.tau + 1e-9;

  const srMax = 0.75 * d;
  const s0Max = 0.5 * d;
  const alphaDeg = input.punchingOn ? input.angulo : 90;
  const alpha = (alphaDeg * Math.PI) / 180;
  const steelType = input.punchingType;
  const fy = fywdEffective(input.h, input.fyk, steelType);
  const fyUser = fywdEffective(input.h, input.fyk, input.punchingType);
  const refFy = fy.fywd;
  const delta = best.tau - conc3;
  const ratioReq = aswOverSrRequired(Math.max(delta, 0), best.uUsed, refFy, alpha);
  const aswAtMax = ratioReq * srMax;

  let tauRd3: number | null = null;
  let tauOut: number | null = null;
  let uOut: number | null = null;
  let areaOut: number | null = null;
  let fOut: number | null = null;
  let p: number | null = null;
  let passesOuter: boolean | null = null;
  let passesDetailing = true;
  const detailNotes: string[] = [];
  let bars: BarLayout | null = null;

  if (input.punchingOn) {
    if (input.nLinhas < 1 || !Number.isInteger(input.nLinhas)) {
      passesDetailing = false;
      detailNotes.push("O número de linhas deve ser um inteiro ≥ 1.");
    }
    if (input.sr <= 0) {
      passesDetailing = false;
      detailNotes.push("O espaçamento radial sr deve ser positivo.");
    } else if (input.sr > srMax + 1e-9) {
      passesDetailing = false;
      detailNotes.push(`sr = ${fmt(input.sr, 2)} cm excede 0,75d = ${fmt(srMax, 2)} cm (19.5.3.3).`);
    }
    if (input.s0 < 0) {
      passesDetailing = false;
      detailNotes.push("A distância da primeira linha não pode ser negativa.");
    } else if (input.s0 > s0Max + 1e-9) {
      passesDetailing = false;
      detailNotes.push(`A primeira linha está a ${fmt(input.s0, 2)} cm da face, acima de 0,5d = ${fmt(s0Max, 2)} cm.`);
    }
    if (input.angulo <= 0 || input.angulo > 90) {
      passesDetailing = false;
      detailNotes.push("O ângulo da armadura de punção deve estar entre 0° e 90° em relação ao plano da laje.");
    }
    if (input.punchingType === "estribos") {
      const phiLimitMm = (input.h / 20) * 10;
      if (input.bitolaW > phiLimitMm + 1e-9) {
        passesDetailing = false;
        detailNotes.push(`Estribo com φ ${fmt(input.bitolaW, 1)} mm acima de h/20 = ${fmt(phiLimitMm, 1)} mm.`);
      }
    }
    if (input.punchingType === "studs" && input.nLinhas < 3) {
      warnings.push({
        severity: "aviso",
        text: "A norma recomenda, de preferência, três ou mais linhas de conectores. O cálculo foi feito com o número informado.",
      });
    }
    if (input.asw <= 0) {
      passesDetailing = false;
      detailNotes.push("Asw deve ser positivo quando a armadura de punção está ativa.");
    }

    p = input.s0 + Math.max(input.nLinhas - 1, 0) * input.sr;
    const rOut = p + 2 * d;
    const polyOut = fullPoly(geom, rOut);
    areaOut = areaOf(polyOut, geom, rOut);
    const atOut = reduceForce(fDesign, areaOut, qSd, input.uniformOn);
    fOut = atOut.force;
    const out = stressAt(geom, rOut, d, atOut.force, bestMX, bestMZ);
    tauOut = out.tau;
    uOut = out.uUsed;
    bars = layoutBars({
      rect: geom.rect,
      distX: geom.distX,
      distZ: geom.distZ,
      d,
      s0: input.s0,
      sr: input.sr,
      nLines: input.nLinhas,
      type: input.punchingType,
      phiMm: input.bitolaW,
      aswTarget: Math.max(input.asw, ratioReq * input.sr),
      suggested: false,
    });
    const aswUsed = bars?.aswPerContour ?? input.asw;
    const steel = tauSteel(aswUsed, fyUser.fywd, input.sr, best.uUsed, (input.angulo * Math.PI) / 180);
    tauRd3 = conc3 + steel;
    passesOuter = tauOut <= rd1.tau + 1e-9;
    if (out.floored) {
      warnings.push({
        severity: "aviso",
        text: "Em C'', M* também superou o momento aplicado; MSd1 ficou em zero, como em C'.",
      });
    }
  }

  for (const note of detailNotes) warnings.push({ severity: "erro", text: note });

  const passesPunching = input.punchingOn ? (tauRd3 !== null && best.tau <= tauRd3 + 1e-9) : passesUnreinforced;
  const reinforcementRequired = !input.punchingOn && !passesUnreinforced;
  const overallPass =
    passesCompression &&
    passesPunching &&
    (input.punchingOn ? passesOuter === true && passesDetailing : true);

  let suggestedLines: number | null = null;
  let suggestedP: number | null = null;
  if (reinforcementRequired || (input.punchingOn && passesOuter === false)) {
    const s0s = s0Max;
    const srS = srMax;
    for (let n = 1; n <= 16; n++) {
      const pTry = s0s + (n - 1) * srS;
      const rTry = pTry + 2 * d;
      const polyTry = fullPoly(geom, rTry);
      const areaTry = areaOf(polyTry, geom, rTry);
      const fTry = reduceForce(fDesign, areaTry, qSd, input.uniformOn).force;
      const st = stressAt(geom, rTry, d, fTry, bestMX, bestMZ);
      if (st.tau <= rd1.tau + 1e-9) {
        suggestedLines = n;
        suggestedP = pTry;
        break;
      }
    }
    if (suggestedLines === null) {
      warnings.push({
        severity: "aviso",
        text: "Com sr = 0,75d e primeira linha a 0,5d, 16 linhas ainda não levam C'' a τSd ≤ τRd1.",
      });
    }
  }

  if (!input.punchingOn && reinforcementRequired) {
    const nLines =
      steelType === "studs" ? Math.max(suggestedLines ?? 3, 3) : Math.max(suggestedLines ?? 1, 1);
    bars = layoutBars({
      rect: geom.rect,
      distX: geom.distX,
      distZ: geom.distZ,
      d,
      s0: s0Max,
      sr: srMax,
      nLines,
      type: steelType,
      phiMm: input.bitolaW,
      aswTarget: aswAtMax,
      suggested: true,
    });
  }

  if (!passesCompression) {
    warnings.push({
      severity: "erro",
      text: "Compressão diagonal em C não atende. Armadura de punção não resolve esta verificação (19.5.3.1).",
    });
  }
  if (reinforcementRequired) {
    warnings.push({
      severity: "erro",
      text: "Armadura de punção é necessária: em C', τSd supera τRd1.",
    });
  }
  if (atC.delta > 0 || atCp.delta > 0) {
    warnings.push({
      severity: "aviso",
      text: "FSd foi reduzido da carga uniforme atuando na face oposta, dentro de cada contorno (19.5.2).",
    });
  }

  const blocks = buildReport({
    input,
    d,
    dx,
    dz,
    phi,
    rhoX,
    rhoZ,
    rho,
    rd1,
    rd2,
    conc3,
    fDesign,
    mXDesign,
    mZDesign,
    qSd,
    geom,
    u0,
    atC,
    atCp,
    areaC,
    areaCp,
    best,
    bestLabel,
    bestMX,
    bestMZ,
    tauC,
    passesCompression,
    passesPunching,
    passesUnreinforced,
    passesOuter,
    passesDetailing,
    overallPass,
    reinforcementRequired,
    tauRd3,
    tauOut,
    uOut,
    fOut,
    p,
    areaOut,
    ratioReq,
    aswAtMax,
    srMax,
    s0Max,
    suggestedLines,
    suggestedP,
    bars,
    refFy,
    fyUser,
    steelType,
  });

  const freeEdges: Array<"minX" | "minZ"> = [];
  if (input.position !== "interno") {
    if (input.position === "borda" && input.edgeAxis === "z") freeEdges.push("minX");
    if (input.position === "borda" && input.edgeAxis === "x") freeEdges.push("minZ");
    if (input.position === "canto") freeEdges.push("minX", "minZ");
  }
  const draw = buildDraw(input, geom, d, freeEdges, bars);

  return {
    ok: true,
    input,
    d,
    dx,
    dz,
    phi,
    rhoX,
    rhoZ,
    rho,
    rhoUsed: rd1.rhoUsed,
    k: rd1.k,
    fcd: rd2.fcd,
    alphaV: rd2.alphaV,
    fywd: input.punchingOn ? fyUser.fywd : refFy,
    fyd: fyUser.fyd,
    fSdInput: fDesign,
    mSdxInput: mXDesign,
    mSdzInput: mZDesign,
    qSd,
    uniformApplied: input.uniformOn,
    u0,
    u: best.uFull,
    uStar: best.uUsed,
    uOut,
    areaC,
    areaCp,
    areaOut,
    fAtC: atC.force,
    fAtCp: atCp.force,
    fAtOut: fOut,
    tauSdC: tauC,
    tauSdCp: best.tau,
    tauSdOut: tauOut,
    tauRd1: rd1.tau,
    tauRd2: rd2.tau,
    tauRd3,
    tauConcrete3: conc3,
    passesCompression,
    passesPunching,
    passesOuter,
    passesDetailing,
    overallPass,
    reinforcementRequired,
    aswOverSr: reinforcementRequired || (input.punchingOn && !passesPunching) ? ratioReq : ratioReq,
    aswAtSrMax: aswAtMax,
    srMax,
    s0Max,
    suggestedLines,
    suggestedP,
    bars,
    p,
    governing: { mSdx: bestMX, mSdz: bestMZ, label: bestLabel },
    kRatioX: best.ratio2,
    kRatioZ: best.ratio1,
    kX: best.k2,
    kZ: best.k1,
    wpX: best.wp2,
    wpZ: best.wp1,
    eStarX: geom.model === "canto" ? (best.cornerBy === "x" ? best.eStar : null) : geom.model === "borda" && geom.edgeParallel === "z" ? best.eStar : null,
    eStarZ: geom.model === "canto" ? (best.cornerBy === "z" ? best.eStar : null) : geom.model === "borda" && geom.edgeParallel === "x" ? best.eStar : null,
    mStarX: best.cornerBy === "x" ? best.mStar : geom.edgeParallel === "z" && geom.model === "borda" ? best.mStar : null,
    mStarZ: best.cornerBy === "z" ? best.mStar : geom.edgeParallel === "x" && geom.model === "borda" ? best.mStar : null,
    checks: [
      {
        id: "C",
        title: "Compressão diagonal no contorno C",
        demand: tauC,
        capacity: rd2.tau,
        unit: "MPa",
        pass: passesCompression,
        note: "τSd ≤ τRd2",
      },
      {
        id: "Cp",
        title: input.punchingOn ? "Punção no contorno C' com armadura" : "Punção no contorno C' sem armadura",
        demand: best.tau,
        capacity: input.punchingOn && tauRd3 !== null ? tauRd3 : rd1.tau,
        unit: "MPa",
        pass: passesPunching,
        note: input.punchingOn ? "τSd ≤ τRd3" : "τSd ≤ τRd1",
      },
      ...(input.punchingOn && tauOut !== null
        ? [
            {
              id: "Cpp",
              title: "Punção no contorno C''",
              demand: tauOut,
              capacity: rd1.tau,
              unit: "MPa",
              pass: passesOuter === true,
              note: "τSd ≤ τRd1",
            },
          ]
        : []),
    ],
    warnings,
    blocks,
    draw,
  };
}

function buildDraw(
  input: PunchingInput,
  geom: Geom,
  d: number,
  freeEdges: Array<"minX" | "minZ">,
  bars: BarLayout | null,
): DrawModel {
  const r = 2 * d;
  const poly = fullPoly(geom, r);
  const reach = bars ? bars.s0 + (bars.lines - 1) * bars.sr + 2 * d : r;
  const margin = Math.max(36, 0.9 * d);
  let x0 = geom.rect.x0 - margin - reach;
  let x1 = geom.rect.x1 + margin + reach;
  let z0 = geom.rect.z0 - margin - reach;
  let z1 = geom.rect.z1 + margin + reach;
  if (freeEdges.includes("minX")) x0 = geom.rect.x0 - input.distX;
  if (freeEdges.includes("minZ")) z0 = geom.rect.z0 - input.distZ;
  const reinforcement: DrawModel["reinforcement"] = [];
  let outer: DrawModel["outer"] = null;
  let outerClosed = false;
  if (bars && bars.lines >= 1 && bars.sr > 0) {
    for (let i = 0; i < bars.lines; i++) {
      const s = bars.s0 + i * bars.sr;
      const linePoly = reinforcementLine(geom.rect, s, geom.distX, geom.distZ);
      reinforcement.push(linePoly.pts);
    }
    const p = bars.s0 + (bars.lines - 1) * bars.sr;
    const outerPoly = fullPoly(geom, p + 2 * d);
    outer = outerPoly.pts;
    outerClosed = outerPoly.closed;
  }
  return {
    column: { ...geom.rect },
    slab: { x0, x1, z0, z1 },
    perimeter: poly.pts,
    perimeterClosed: poly.closed,
    outer,
    outerClosed,
    reinforcement,
    bars: bars?.pieces ?? [],
    barType: bars?.type ?? null,
    barSuggested: bars?.suggested ?? false,
    freeEdges,
    cx: input.cx,
    cz: input.cz,
    d,
    h: input.h,
    twoD: 2 * d,
  };
}

function emptyResult(input: PunchingInput): PunchingResult {
  return {
    ok: false,
    input,
    d: 0,
    dx: 0,
    dz: 0,
    phi: 0,
    rhoX: 0,
    rhoZ: 0,
    rho: 0,
    rhoUsed: 0,
    k: 0,
    fcd: 0,
    alphaV: 0,
    fywd: 0,
    fyd: 0,
    fSdInput: 0,
    mSdxInput: 0,
    mSdzInput: 0,
    qSd: 0,
    uniformApplied: false,
    u0: 0,
    u: 0,
    uStar: 0,
    uOut: null,
    areaC: 0,
    areaCp: 0,
    areaOut: null,
    fAtC: 0,
    fAtCp: 0,
    fAtOut: null,
    tauSdC: 0,
    tauSdCp: 0,
    tauSdOut: null,
    tauRd1: 0,
    tauRd2: 0,
    tauRd3: null,
    tauConcrete3: 0,
    passesCompression: false,
    passesPunching: false,
    passesOuter: null,
    passesDetailing: false,
    overallPass: false,
    reinforcementRequired: false,
    aswOverSr: null,
    aswAtSrMax: null,
    srMax: 0,
    s0Max: 0,
    suggestedLines: null,
    suggestedP: null,
    bars: null,
    p: null,
    governing: { mSdx: 0, mSdz: 0, label: "" },
    kRatioX: null,
    kRatioZ: null,
    kX: null,
    kZ: null,
    wpX: null,
    wpZ: null,
    eStarX: null,
    eStarZ: null,
    mStarX: null,
    mStarZ: null,
    checks: [],
    warnings: [],
    blocks: [],
    draw: null,
  };
}

interface ReportCtx {
  input: PunchingInput;
  d: number;
  dx: number;
  dz: number;
  phi: number;
  rhoX: number;
  rhoZ: number;
  rho: number;
  rd1: ReturnType<typeof tauRd1>;
  rd2: ReturnType<typeof tauRd2>;
  conc3: number;
  fDesign: number;
  mXDesign: number;
  mZDesign: number;
  qSd: number;
  geom: Geom;
  u0: number;
  atC: { force: number; delta: number };
  atCp: { force: number; delta: number };
  areaC: number;
  areaCp: number;
  best: Stress;
  bestLabel: string;
  bestMX: number;
  bestMZ: number;
  tauC: number;
  passesCompression: boolean;
  passesPunching: boolean;
  passesUnreinforced: boolean;
  passesOuter: boolean | null;
  passesDetailing: boolean;
  overallPass: boolean;
  reinforcementRequired: boolean;
  tauRd3: number | null;
  tauOut: number | null;
  uOut: number | null;
  fOut: number | null;
  p: number | null;
  areaOut: number | null;
  ratioReq: number;
  aswAtMax: number;
  srMax: number;
  s0Max: number;
  suggestedLines: number | null;
  suggestedP: number | null;
  bars: BarLayout | null;
  refFy: number;
  fyUser: { fywd: number; fyd: number };
  steelType: "estribos" | "studs";
}

function pieceLines(bars: BarLayout | null): ReportLine[] {
  if (!bars) return [];
  const nome = bars.type === "studs" ? "studs" : "estribos";
  const pernas = bars.type === "estribos" ? `, ${bars.perLine * bars.legsPerPiece} pernas por contorno` : "";
  return [
    line(
      bars.suggested ? "Peças da disposição sugerida" : "Peças desenhadas",
      `${bars.lines * bars.perLine} ${nome}`,
      "Parte reta e parte diagonal, com distância ≤ 0,75d ao longo do contorno externo.",
      `${bars.perLine} por linha × ${bars.lines} linhas. Reta: ${bars.reta}. Diagonal: ${bars.diagonal}. φ = ${fmt(bars.phiMm, 1)} mm${pernas}.`,
    ),
    line(
      "Asw da disposição",
      `${fmt(bars.aswPerContour, 2)} cm² por contorno`,
      bars.type === "estribos"
        ? "Cada estribo entra com duas pernas."
        : "Cada stud entra com uma barra.",
      `${bars.perLine} × ${bars.legsPerPiece} × ${fmt(bars.areaLeg, 3)} cm²`,
    ),
  ];
}

function buildReport(ctx: ReportCtx): ReportBlock[] {
  const blocks: ReportBlock[] = [];
  const pos =
    ctx.input.position === "interno" ? "interno" : ctx.input.position === "borda" ? "de borda" : "de canto";
  const verdict = ctx.overallPass
    ? "A ligação atende às verificações de punção desta versão."
    : ctx.reinforcementRequired
      ? "Armadura de punção é necessária."
      : "A ligação não atende.";

  blocks.push({
    heading: "Veredito",
    summary: true,
    lines: [
      line(verdict),
      line(
        "Compressão diagonal (C)",
        ctx.passesCompression ? "Atende" : "Não atende",
        "τSd ≤ τRd2 = 0,27·αv·fcd",
        `τSd = ${fmt(ctx.tauC, 3)} MPa, τRd2 = ${fmt(ctx.rd2.tau, 3)} MPa`,
      ),
      line(
        ctx.input.punchingOn ? "Punção em C' com armadura" : "Punção em C' sem armadura",
        ctx.passesPunching ? "Atende" : "Não atende",
        ctx.input.punchingOn ? "τSd ≤ τRd3" : "τSd ≤ τRd1",
        `τSd = ${fmt(ctx.best.tau, 3)} MPa, ${ctx.input.punchingOn ? "τRd3" : "τRd1"} = ${fmt(
          ctx.input.punchingOn && ctx.tauRd3 !== null ? ctx.tauRd3 : ctx.rd1.tau,
          3,
        )} MPa`,
      ),
      ...(ctx.input.punchingOn && ctx.tauOut !== null
        ? [
            line(
              "Contorno externo C''",
              ctx.passesOuter ? "Atende" : "Não atende",
              "τSd ≤ τRd1",
              `τSd = ${fmt(ctx.tauOut, 3)} MPa, τRd1 = ${fmt(ctx.rd1.tau, 3)} MPa`,
            ),
          ]
        : []),
      ...(ctx.input.punchingOn
        ? [line("Limites geométricos da armadura", ctx.passesDetailing ? "Atendidos" : "Não atendidos")]
        : []),
      line("Edição", EDITION_NOTE),
    ],
  });

  const reduced = ctx.input.uniformOn;
  blocks.push({
    heading: "Esforços de cálculo",
    summary: true,
    lines: [
      line(
        "Modo",
        ctx.input.loadMode === "calculo" ? "Valores já de cálculo" : `Valores característicos com γf = ${fmt(ctx.input.gammaF, 2)}`,
      ),
      line("FSd de entrada", `${fmt(ctx.fDesign, 2)} kN`),
      line("MSd,x", `${fmt(ctx.mXDesign, 2)} kN·m`, "Momento em torno de x, excentricidade na direção z."),
      line("MSd,z", `${fmt(ctx.mZDesign, 2)} kN·m`, "Momento em torno de z, excentricidade na direção x."),
      line(
        "Combinação de sinais",
        ctx.input.bothSigns ? `Governante: ${ctx.bestLabel}` : "Apenas os sinais informados",
      ),
      line(
        "Redução de FSd pela carga uniforme",
        reduced
          ? `Aplicada. qSd = ${fmt(ctx.qSd, 2)} kN/m². Dentro de C, ΔF = ${fmt(ctx.atC.delta, 2)} kN (FSd = ${fmt(ctx.atC.force, 2)} kN). Dentro de C', ΔF = ${fmt(ctx.atCp.delta, 2)} kN (FSd = ${fmt(ctx.atCp.force, 2)} kN).`
          : "Não aplicada. FSd não foi reduzido.",
      ),
      line("Pilar", `${pos}, ${fmt(ctx.input.cx, 1)} cm × ${fmt(ctx.input.cz, 1)} cm`),
    ],
  });

  blocks.push({
    heading: "Altura útil e armadura de flexão",
    summary: true,
    lines: [
      line(
        "dx (camada externa, paralela a x)",
        `${fmt(ctx.dx, 3)} cm`,
        "dx = h − c − φ/2",
        `${fmt(ctx.input.h, 2)} − ${fmt(ctx.input.cobrimento, 2)} − ${fmt(ctx.phi / 2, 3)} = ${fmt(ctx.dx, 3)} cm`,
      ),
      line(
        "dz (camada interna, paralela a z)",
        `${fmt(ctx.dz, 3)} cm`,
        "dz = h − c − φ − φ/2",
        `${fmt(ctx.input.h, 2)} − ${fmt(ctx.input.cobrimento, 2)} − ${fmt(ctx.phi, 3)} − ${fmt(ctx.phi / 2, 3)} = ${fmt(ctx.dz, 3)} cm`,
      ),
      line("d = (dx + dz) / 2", `${fmt(ctx.d, 3)} cm`, "Item 19.5.2. A camada paralela a x é a externa."),
      line("ρx = As,x / (100 · dx)", fmtRho(ctx.rhoX), undefined, `${fmt(ctx.input.asx, 2)} / (100 · ${fmt(ctx.dx, 3)})`),
      line("ρz = As,z / (100 · dz)", fmtRho(ctx.rhoZ)),
      line("ρ = √(ρx · ρz) ≤ 0,02", fmtRho(ctx.rd1.rhoUsed), "Item 19.5.3.2.", `√(${fmt(ctx.rhoX, 5)} · ${fmt(ctx.rhoZ, 5)}) = ${fmt(ctx.rho, 5)}`),
      line("k = 1 + √(20/d) ≤ 2", fmt(ctx.rd1.k, 4), "d em cm. Item 19.5.3.2.", `1 + √(20/${fmt(ctx.d, 3)}) = ${fmt(1 + Math.sqrt(20 / ctx.d), 4)}`),
    ],
  });

  const uLabel = ctx.geom.model === "interno" ? "u = u*" : "u* (reduzido)";
  blocks.push({
    heading: "Perímetros",
    summary: true,
    lines: [
      line("u0, contorno C", `${fmt(ctx.u0, 2)} cm`, "Perímetro das faces em contato com a laje."),
      line("u geométrico de C' (a 2d)", `${fmt(ctx.best.uFull, 2)} cm`),
      line(uLabel + " usado em τSd de C'", `${fmt(ctx.best.uUsed, 2)} cm`, "Item 19.5.2. Em pilar interno, u* = u."),
      line("Área dentro de C", `${fmt(ctx.areaC / 10_000, 4)} m²`),
      line("Área dentro de C'", `${fmt(ctx.areaCp / 10_000, 4)} m²`),
      ...(ctx.uOut !== null
        ? [line("u* de C''", `${fmt(ctx.uOut, 2)} cm`, "Contorno a 2d da última linha de armadura.")]
        : []),
    ],
  });

  const s = ctx.best;
  blocks.push({
    heading: "Tensão solicitante em C'",
    summary: true,
    lines: [
      line("Modelo", ctx.geom.model === "interno" ? "Pilar interno, momentos nas duas direções superpostos (19.5.2)." : ctx.geom.model === "borda" ? "Pilar de borda, com u*, e* e MSd1 = (MSd − M*) ≥ 0 (19.5.2)." : "Pilar de canto: cada borda é verificada em separado, sem somar os dois momentos (19.5.2). Governa a borda de maior τSd."),
      ...(s.eStar !== null
        ? [
            line("e* do perímetro reduzido", `${fmt(s.eStar, 2)} cm`),
            line("M* = FSd · e*", `${fmt(s.mStar ?? 0, 2)} kN·m`, undefined, `${fmt(ctx.atCp.force, 2)} · ${fmt((s.eStar ?? 0) / 100, 4)}`),
            line("MSd1 = max(MSd − M*, 0)", `${fmt(s.mSd1 ?? 0, 2)} kN·m`),
          ]
        : []),
      line("K na direção z (C1/C2)", `${fmt(s.k1, 3)}`, "Tabela 19.2.", `C1/C2 = ${fmt(s.ratio1, 3)}`),
      line("K na outra direção", `${fmt(s.k2, 3)}`, ctx.geom.model === "borda" ? "K2 com C2/(2·C1) no lugar de C1/C2." : "Tabela 19.2, eixos trocados.", `relação = ${fmt(s.ratio2, 3)}`),
      line("Wp,1", `${fmt(s.wp1, 1)} cm²`),
      line("Wp,2", `${fmt(s.wp2, 1)} cm²`),
      line(
        "Parcela da força",
        `${fmt(s.tauForce, 4)} MPa`,
        "10 · FSd / (u · d), com F em kN e u, d em cm, para obter MPa.",
        `10 · ${fmt(ctx.atCp.force, 2)} / (${fmt(s.uUsed, 2)} · ${fmt(ctx.d, 3)})`,
      ),
      line("Parcela do momento 1", `${fmt(s.tauM1, 4)} MPa`, "10 · K · M(kN·cm) / (Wp · d)"),
      line("Parcela do momento 2", `${fmt(s.tauM2, 4)} MPa`),
      line("τSd em C'", `${fmt(s.tau, 4)} MPa`),
      line(
        "τSd em C",
        `${fmt(ctx.tauC, 4)} MPa`,
        "10 · FSd,C / (u0 · d), sem momento.",
        `10 · ${fmt(ctx.atC.force, 2)} / (${fmt(ctx.u0, 2)} · ${fmt(ctx.d, 3)})`,
      ),
    ],
  });

  blocks.push({
    heading: "Tensões resistentes",
    summary: true,
    lines: [
      line(
        "αv = 1 − fck/250",
        fmt(ctx.rd2.alphaV, 4),
        undefined,
        `1 − ${fmt(ctx.input.fck, 1)}/250`,
      ),
      line("fcd = fck / γc", `${fmt(ctx.rd2.fcd, 3)} MPa`, undefined, `${fmt(ctx.input.fck, 1)} / ${fmt(ctx.input.gammaC, 2)}`),
      line(
        "τRd2 = 0,27 · αv · fcd",
        `${fmt(ctx.rd2.tau, 3)} MPa`,
        "Item 19.5.3.1. Sem o acréscimo de 20%.",
        `0,27 · ${fmt(ctx.rd2.alphaV, 4)} · ${fmt(ctx.rd2.fcd, 3)}`,
      ),
      line(
        "τRd1 = 0,13 · k · (100 · ρ · fck)^(1/3)",
        `${fmt(ctx.rd1.tau, 3)} MPa`,
        "Item 19.5.3.2, σcp = 0.",
        `0,13 · ${fmt(ctx.rd1.k, 4)} · (100 · ${fmt(ctx.rd1.rhoUsed, 5)} · ${fmt(ctx.input.fck, 1)})^(1/3)`,
      ),
      line(
        "Parcela de concreto de τRd3",
        `${fmt(ctx.conc3, 3)} MPa`,
        "0,10 · k · (100 · ρ · fck)^(1/3). Item 19.5.3.3.",
      ),
      ...(ctx.tauRd3 !== null
        ? [
            line(
              "τRd3",
              `${fmt(ctx.tauRd3, 3)} MPa`,
              "Parcela de concreto + 1,5 · (d/sr) · (Asw · fywd · sen α) / (u · d).",
              `Asw = ${fmt(ctx.bars && !ctx.bars.suggested ? ctx.bars.aswPerContour : ctx.input.asw, 2)} cm², sr = ${fmt(ctx.input.sr, 2)} cm, α = ${fmt(ctx.input.angulo, 1)}°, fywd = ${fmt(ctx.fyUser.fywd, 1)} MPa, u = ${fmt(ctx.best.uUsed, 2)} cm`,
            ),
          ]
        : []),
      ...(ctx.tauOut !== null
        ? [line("τSd em C''", `${fmt(ctx.tauOut, 3)} MPa`, "Mesma expressão de C', no perímetro externo. Comparar com τRd1.")]
        : []),
    ],
  });

  if (ctx.reinforcementRequired || ctx.input.punchingOn) {
    const lines: ReportLine[] = [];
    if (ctx.reinforcementRequired) {
      lines.push(
        line("Situação", "Armadura de punção é necessária, porque τSd > τRd1 em C' e a armadura está desligada."),
        line(
          "Asw/sr necessário em C'",
          `${fmt(ctx.ratioReq, 4)} cm²/cm`,
          `Referência: ${ctx.steelType === "studs" ? "studs" : "estribos"} verticais, α = 90°, fywd = ${fmt(ctx.refFy, 1)} MPa.`,
          `(τSd − τc,3) · u / (1,5 · fywd · sen α) = (${fmt(ctx.best.tau, 3)} − ${fmt(ctx.conc3, 3)}) · ${fmt(ctx.best.uUsed, 2)} / (1,5 · ${fmt(ctx.refFy, 1)})`,
        ),
        line(
          `Asw para sr = 0,75d = ${fmt(ctx.srMax, 2)} cm`,
          `${fmt(ctx.aswAtMax, 2)} cm² por contorno`,
        ),
        line(
          "Linhas para C'' passar",
          ctx.suggestedLines
            ? `${ctx.suggestedLines} ${ctx.suggestedLines === 1 ? "linha basta" : "linhas bastam"} para C'', primeira a 0,5d = ${fmt(ctx.s0Max, 2)} cm, sr = 0,75d, p = ${fmt(ctx.suggestedP ?? 0, 2)} cm.${
                ctx.bars?.type === "studs" && ctx.bars.lines > ctx.suggestedLines
                  ? ` A planta desenha ${ctx.bars.lines} linhas: o item 19.5.3.3 prefere três ou mais linhas de conectores.`
                  : ""
              }`
            : "Não foi encontrada uma disposição em até 16 linhas com sr = 0,75d.",
        ),
        ...pieceLines(ctx.bars),
      );
    } else {
      lines.push(
        line("Tipo", ctx.input.punchingType === "studs" ? "Studs (conectores)" : "Estribos verticais"),
        line("Asw por contorno", `${fmt(ctx.input.asw, 2)} cm²`),
        line("sr", `${fmt(ctx.input.sr, 2)} cm`, `Limite 0,75d = ${fmt(ctx.srMax, 2)} cm.`),
        line("s0", `${fmt(ctx.input.s0, 2)} cm`, `Limite 0,5d = ${fmt(ctx.s0Max, 2)} cm.`),
        line("Linhas", String(ctx.input.nLinhas)),
        line("α", `${fmt(ctx.input.angulo, 1)}°`),
        line("fywd", `${fmt(ctx.fyUser.fywd, 1)} MPa`, `fyd = fyk/γs = ${fmt(ctx.fyUser.fyd, 1)} MPa.`),
        line("p até a última linha", `${fmt(ctx.p ?? 0, 2)} cm`),
        ...pieceLines(ctx.bars),
        line("FSd em C''", ctx.fOut !== null ? `${fmt(ctx.fOut, 2)} kN` : "—"),
      );
      if (!ctx.passesPunching) {
        lines.push(
          line(
            "Asw/sr ainda necessário para τRd3 alcançar τSd",
            `${fmt(ctx.ratioReq, 4)} cm²/cm`,
          ),
        );
      }
    }
    blocks.push({ heading: "Armadura de punção", summary: true, lines });
  }

  blocks.push({
    heading: "Premissas",
    summary: true,
    lines: PREMISSAS.map((text) => line(text)),
  });

  return blocks;
}
