import { contourParts, type ContourPart, type Rect } from "./geometry";
import type { BarLayout, BarPiece, PunchingType } from "./types";

/** Área de uma barra circular, cm², com φ em mm. */
export function barAreaCm2(phiMm: number): number {
  if (phiMm <= 0) return 0;
  const phiCm = phiMm / 10;
  return (Math.PI * phiCm * phiCm) / 4;
}

/**
 * Peças da armadura de punção, nas partes retas e nas diagonais.
 *
 * NBR 6118:2023, item 19.5.3.3: linhas radiais, primeira a no máximo 0,5d
 * da face e sr ≤ 0,75d. O item 20.4 manda cumprir as distâncias das figuras
 * de disposição em planta e em corte. A norma não publica um segundo número
 * para o espaçamento ao longo do contorno; aqui a distância entre peças
 * vizinhas, medida nesse contorno, também fica ≤ 0,75d na linha mais externa.
 * As linhas internas repetem os mesmos raios, então ficam mais juntas.
 * Cada stud é uma peça. Cada estribo é uma peça de duas pernas.
 */
export function layoutBars(opts: {
  rect: Rect;
  distX: number;
  distZ: number;
  d: number;
  s0: number;
  sr: number;
  nLines: number;
  type: PunchingType;
  phiMm: number;
  aswTarget: number;
  suggested: boolean;
}): BarLayout | null {
  const { rect, distX, distZ, d, s0, sr, nLines, type, phiMm, aswTarget, suggested } = opts;
  if (d <= 0 || nLines < 1 || sr <= 0 || s0 < 0) return null;
  const stMax = 0.75 * d;
  const outerS = s0 + (nLines - 1) * sr;
  const cutX = Number.isFinite(distX) && distX < outerS - 1e-9;
  const cutZ = Number.isFinite(distZ) && distZ < outerS - 1e-9;
  const outer = contourParts(rect, outerS, distX, distZ);
  if (outer.length === 0) return null;

  const counts = outer.map((part) => Math.max(1, Math.ceil(part.length / stMax - 1e-12)));
  const legsPerPiece = type === "estribos" ? 2 : 1;
  const areaLeg = barAreaCm2(phiMm);
  const minPieces =
    areaLeg > 0 && aswTarget > 0 ? Math.ceil(aswTarget / (legsPerPiece * areaLeg) - 1e-12) : 0;
  let guard = 0;
  while (counts.reduce((a, b) => a + b, 0) < minPieces && guard < 4000) {
    let index = 0;
    let widest = -1;
    for (let i = 0; i < outer.length; i++) {
      const spacing = outer[i].length / counts[i];
      if (spacing > widest) {
        widest = spacing;
        index = i;
      }
    }
    counts[index] += 1;
    guard += 1;
  }

  const rayOf: number[][] = [];
  let nextRay = 0;
  for (let j = 0; j < outer.length; j++) {
    const ids: number[] = [];
    for (let k = 0; k < counts[j]; k++) ids.push(nextRay++);
    rayOf.push(ids);
  }

  const pieces: BarPiece[] = [];
  for (let line = 0; line < nLines; line++) {
    const s = s0 + line * sr;
    const parts = contourParts(rect, s, distX, distZ);
    if (parts.length !== outer.length) return null;
    for (let j = 0; j < parts.length; j++) {
      const n = counts[j];
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n;
        const pt = parts[j].at(t);
        const tan = parts[j].tangent(t);
        pieces.push({
          x: pt.x,
          z: pt.z,
          angle: Math.atan2(tan.z, tan.x),
          kind: parts[j].kind,
          line,
          ray: rayOf[j][k],
        });
      }
    }
  }

  const perLine = counts.reduce((a, b) => a + b, 0);
  const onOuter = pieces.filter((p) => p.line === nLines - 1);
  return {
    pieces,
    lines: nLines,
    perLine,
    reta: onOuter.filter((p) => p.kind === "reta").length * nLines,
    diagonal: onOuter.filter((p) => p.kind === "diagonal").length * nLines,
    s0,
    sr,
    stMax,
    stUsed: maxGap(outer, counts, !cutX && !cutZ),
    type,
    phiMm,
    legsPerPiece,
    areaLeg,
    aswPerContour: perLine * legsPerPiece * areaLeg,
    suggested,
  };
}

/** Uma fiada radial com pelo menos duas peças, da mais interna à mais externa. */
export function radialRays(pieces: BarPiece[]): BarPiece[][] {
  const map = new Map<number, BarPiece[]>();
  for (const piece of pieces) {
    const list = map.get(piece.ray);
    if (list) list.push(piece);
    else map.set(piece.ray, [piece]);
  }
  const rays: BarPiece[][] = [];
  for (const list of map.values()) {
    if (list.length < 2) continue;
    list.sort((a, b) => a.line - b.line);
    rays.push(list);
  }
  return rays;
}

function maxGap(parts: ContourPart[], counts: number[], closed: boolean): number {
  let gap = 0;
  for (let i = 0; i < parts.length; i++) {
    const own = parts[i].length / counts[i];
    gap = Math.max(gap, own);
    if (!closed && i === parts.length - 1) continue;
    const j = (i + 1) % parts.length;
    gap = Math.max(gap, own / 2 + parts[j].length / counts[j] / 2);
  }
  return gap;
}
