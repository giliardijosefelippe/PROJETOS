import { describe, expect, it } from "vitest";
import { layoutBars } from "./armadura";
import { contourParts, criticalPerimeter, dist } from "./geometry";
import { calculate, defaultInput } from "./puncao";
import type { PunchingInput } from "./types";

const rect = { x0: -20, x1: 20, z0: -20, z1: 20 };

function gapOk(layout: NonNullable<ReturnType<typeof layoutBars>>, stMax: number) {
  expect(layout.stUsed).toBeLessThanOrEqual(stMax + 1e-6);
  expect(layout.reta).toBeGreaterThan(0);
  expect(layout.diagonal).toBeGreaterThan(0);
  expect(layout.pieces.length).toBe(layout.perLine * layout.lines);
}

describe("disposição das peças", () => {
  it("coloca studs na reta e na diagonal, com espaçamento ≤ 0,75d", () => {
    const d = 20;
    const layout = layoutBars({
      rect,
      distX: Number.POSITIVE_INFINITY,
      distZ: Number.POSITIVE_INFINITY,
      d,
      s0: 10,
      sr: 15,
      nLines: 3,
      type: "studs",
      phiMm: 8,
      aswTarget: 0,
      suggested: false,
    });
    expect(layout).not.toBeNull();
    gapOk(layout!, 0.75 * d);
    const outer = layout!.pieces.filter((p) => p.line === 2);
    expect(outer.some((p) => p.kind === "reta")).toBe(true);
    expect(outer.some((p) => p.kind === "diagonal")).toBe(true);
    expect(layout!.aswPerContour).toBeCloseTo(layout!.perLine * layout!.areaLeg, 6);
  });

  it("estribo conta duas pernas e aumenta as peças se Asw pedir", () => {
    const spaced = layoutBars({
      rect,
      distX: Number.POSITIVE_INFINITY,
      distZ: Number.POSITIVE_INFINITY,
      d: 20,
      s0: 10,
      sr: 15,
      nLines: 2,
      type: "estribos",
      phiMm: 8,
      aswTarget: 0,
      suggested: false,
    })!;
    const heavy = layoutBars({
      rect,
      distX: Number.POSITIVE_INFINITY,
      distZ: Number.POSITIVE_INFINITY,
      d: 20,
      s0: 10,
      sr: 15,
      nLines: 2,
      type: "estribos",
      phiMm: 8,
      aswTarget: spaced.aswPerContour + 5,
      suggested: false,
    })!;
    expect(spaced.legsPerPiece).toBe(2);
    expect(heavy.perLine).toBeGreaterThan(spaced.perLine);
    expect(heavy.aswPerContour).toBeGreaterThanOrEqual(spaced.aswPerContour + 5 - 1e-6);
    expect(heavy.stUsed).toBeLessThanOrEqual(0.75 * 20 + 1e-6);
  });

  it("não desenha peça fora da laje no canto", () => {
    const column = { x0: 0, x1: 30, z0: 0, z1: 40 };
    const layout = layoutBars({
      rect: column,
      distX: 0,
      distZ: 0,
      d: 20,
      s0: 10,
      sr: 15,
      nLines: 3,
      type: "studs",
      phiMm: 10,
      aswTarget: 4,
      suggested: true,
    })!;
    expect(layout.reta).toBeGreaterThan(0);
    expect(layout.diagonal).toBeGreaterThan(0);
    for (const piece of layout.pieces) {
      expect(piece.x).toBeGreaterThanOrEqual(-0.05);
      expect(piece.z).toBeGreaterThanOrEqual(-0.05);
    }
  });

  it("os pontos do contorno coincidem com o perímetro crítico", () => {
    const r = 40;
    const poly = criticalPerimeter(rect, r, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    const parts = contourParts(rect, r, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY);
    for (const part of parts) {
      for (const t of [0.25, 0.5, 0.75]) {
        const p = part.at(t);
        let best = Number.POSITIVE_INFINITY;
        const n = poly.pts.length;
        const last = poly.closed ? n : n - 1;
        for (let i = 0; i < last; i++) {
          best = Math.min(best, pointSegment(p, poly.pts[i], poly.pts[(i + 1) % n]));
        }
        expect(best).toBeLessThan(0.05);
      }
    }
  });
});

describe("exemplo padrão", () => {
  it("já desenha a sugestão com peças na reta e na diagonal", () => {
    const result = calculate(defaultInput);
    expect(result.reinforcementRequired).toBe(true);
    expect(result.bars).not.toBeNull();
    expect(result.bars!.suggested).toBe(true);
    expect(result.bars!.type).toBe("studs");
    expect(result.bars!.reta).toBeGreaterThan(0);
    expect(result.bars!.diagonal).toBeGreaterThan(0);
    expect(result.bars!.stUsed).toBeLessThanOrEqual(result.bars!.stMax + 1e-6);
    expect(result.bars!.lines).toBeGreaterThanOrEqual(3);
    expect(result.draw?.bars.length).toBe(result.bars!.pieces.length);
  });

  it("troca o desenho para estribos quando o tipo muda", () => {
    const input: PunchingInput = { ...defaultInput, punchingType: "estribos" };
    const result = calculate(input);
    expect(result.bars!.type).toBe("estribos");
    expect(result.bars!.legsPerPiece).toBe(2);
    expect(result.bars!.diagonal).toBeGreaterThan(0);
  });
});

function pointSegment(
  p: { x: number; z: number },
  a: { x: number; z: number },
  b: { x: number; z: number },
): number {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const len2 = abx * abx + abz * abz;
  if (len2 === 0) return dist(p, a);
  const t = Math.min(1, Math.max(0, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return dist(p, { x: a.x + abx * t, z: a.z + abz * t });
}
