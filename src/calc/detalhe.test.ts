import { describe, expect, it } from "vitest";
import { bendPinMm, rebarDetail } from "./detalhe";

describe("detalhe da armadura", () => {
  it("mede o estribo do exemplo com gancho de 5 cm e altura h − 2c", () => {
    const d = rebarDetail({ hCm: 25, coverCm: 2.5, phiMm: 8, stMaxCm: 0.75 * 21.25 });
    expect(d.heightCm).toBeCloseTo(20, 6);
    expect(d.hookCm).toBeCloseTo(5, 6);
    expect(d.phiOk).toBe(true);
    expect(d.phiLimitMm).toBeCloseTo(12.5, 6);
    expect(d.bendMm).toBeCloseTo(24, 6);
    expect(d.widthCm).toBeLessThan(0.55 * 0.75 * 21.25 + 1e-6);
    expect(d.widthCm).toBeGreaterThan(4);
    expect(d.studLengthCm).toBeCloseTo(d.heightCm, 6);
  });

  it("aumenta o gancho para 5φ quando a bitola passa de 10 mm", () => {
    const d = rebarDetail({ hCm: 30, coverCm: 2.5, phiMm: 12.5, stMaxCm: 16 });
    expect(d.hookCm).toBeCloseTo(6.25, 6);
    expect(bendPinMm(12.5)).toBeCloseTo(62.5, 6);
    expect(d.phiOk).toBe(true);
  });

  it("acusa bitola acima de h/20", () => {
    const d = rebarDetail({ hCm: 16, coverCm: 2, phiMm: 10, stMaxCm: 10 });
    expect(d.phiLimitMm).toBeCloseTo(8, 6);
    expect(d.phiOk).toBe(false);
  });
});
