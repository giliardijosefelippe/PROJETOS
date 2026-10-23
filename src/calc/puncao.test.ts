import { describe, expect, it } from "vitest";
import {
  areaRoundedRect,
  criticalPerimeter,
  enclosedArea,
  plasticModulus,
  polylineLength,
  roundedRect,
  wpInteriorClosed,
} from "./geometry";
import {
  aswOverSrRequired,
  calculate,
  defaultInput,
  effectiveDepth,
  fywdEffective,
  kFromRatio,
  tauRd1,
  tauRd2,
} from "./puncao";
import type { PunchingInput } from "./types";

function base(over: Partial<PunchingInput> = {}): PunchingInput {
  return {
    ...defaultInput,
    cx: 40,
    cz: 40,
    h: 23.5,
    cobrimento: 2.5,
    bitola: 10,
    asx: 10,
    asz: 10,
    fSd: 500,
    mSdx: 0,
    mSdz: 0,
    bothSigns: false,
    punchingOn: false,
    uniformOn: false,
    position: "interno",
    loadMode: "calculo",
    ...over,
  };
}

describe("Tabela 19.2", () => {
  it("interpola e não extrapola", () => {
    expect(kFromRatio(0.5).k).toBeCloseTo(0.45, 6);
    expect(kFromRatio(1).k).toBeCloseTo(0.6, 6);
    expect(kFromRatio(2).k).toBeCloseTo(0.7, 6);
    expect(kFromRatio(3).k).toBeCloseTo(0.8, 6);
    expect(kFromRatio(1.5).k).toBeCloseTo(0.65, 6);
    expect(kFromRatio(0.25)).toEqual({ k: 0.45, outside: true });
    expect(kFromRatio(4)).toEqual({ k: 0.8, outside: true });
  });
});

describe("resistências", () => {
  it("τRd2 de C30 com γc = 1,4", () => {
    const r = tauRd2(30, 1.4);
    expect(r.alphaV).toBeCloseTo(0.88, 6);
    expect(r.fcd).toBeCloseTo(30 / 1.4, 6);
    expect(r.tau).toBeCloseTo(0.27 * 0.88 * (30 / 1.4), 6);
    expect(r.tau).toBeCloseTo(5.0914286, 4);
  });

  it("τRd1 com d = 20 cm, ρ = 0,01 e k no limite 2", () => {
    const r = tauRd1(20, 0.01, 30);
    expect(r.k).toBeCloseTo(2, 6);
    expect(r.kCapped).toBe(false);
    const cub = Math.cbrt(100 * 0.01 * 30);
    expect(r.tau).toBeCloseTo(0.13 * 2 * cub, 6);
  });

  it("limita ρ a 0,02 e k a 2", () => {
    const r = tauRd1(5, 0.03, 30);
    expect(r.k).toBe(2);
    expect(r.kCapped).toBe(true);
    expect(r.rhoUsed).toBe(0.02);
    expect(r.rhoCapped).toBe(true);
  });
});

describe("geometria do perímetro", () => {
  it("Wp numérico do pilar interno reproduz a expressão de 19.5.2.2", () => {
    const rect = { x0: -20, x1: 20, z0: -15, z1: 15 };
    const r = 16;
    const poly = roundedRect(rect, r);
    const wp = plasticModulus(poly, "x", 0);
    const closed = wpInteriorClosed(40, 30, r);
    expect(Math.abs(wp - closed) / closed).toBeLessThan(1e-4);
    expect(polylineLength(poly)).toBeCloseTo(2 * (40 + 30) + 2 * Math.PI * r, 1);
    expect(Math.abs(enclosedArea(poly) - areaRoundedRect(40, 30, r)) / areaRoundedRect(40, 30, r)).toBeLessThan(1e-4);
  });

  it("pilar de borda com a face na borda tem o comprimento clássico", () => {
    const cPar = 50;
    const cPerp = 40;
    const r = 40;
    const poly = criticalPerimeter({ x0: -cPar / 2, x1: cPar / 2, z0: 0, z1: cPerp }, r, Number.POSITIVE_INFINITY, 0);
    expect(polylineLength(poly)).toBeCloseTo(2 * cPerp + cPar + Math.PI * r, 1);
  });

  it("pilar de canto com as faces na borda tem um quarto de círculo", () => {
    const poly = criticalPerimeter({ x0: 0, x1: 30, z0: 0, z1: 40 }, 20, 0, 0);
    expect(polylineLength(poly)).toBeCloseTo(30 + 40 + (Math.PI / 2) * 20, 2);
  });
});

describe("pilar interno sem momento e sem armadura de punção", () => {
  const result = calculate(base());

  it("calcula d, u, u0, τSd, τRd1 e τRd2", () => {
    expect(result.ok).toBe(true);
    const depth = effectiveDepth(23.5, 2.5, 10);
    expect(depth.d).toBeCloseTo(20, 6);
    expect(result.d).toBeCloseTo(20, 6);
    expect(result.dx).toBeCloseTo(20.5, 6);
    expect(result.dz).toBeCloseTo(19.5, 6);

    const u0 = 2 * (40 + 40);
    const u = u0 + 4 * Math.PI * 20;
    expect(result.u0).toBeCloseTo(u0, 6);
    expect(result.u).toBeCloseTo(u, 4);
    expect(result.uStar).toBeCloseTo(u, 4);

    const tauSd = (10 * 500) / (u * 20);
    const tauC = (10 * 500) / (u0 * 20);
    expect(result.tauSdCp).toBeCloseTo(tauSd, 4);
    expect(result.tauSdC).toBeCloseTo(tauC, 4);
    expect(result.tauSdC).toBeCloseTo(1.5625, 4);

    const rhoX = 10 / (100 * 20.5);
    const rhoZ = 10 / (100 * 19.5);
    const rho = Math.sqrt(rhoX * rhoZ);
    const rd1 = 0.13 * 2 * Math.cbrt(100 * Math.min(rho, 0.02) * 30);
    expect(result.tauRd1).toBeCloseTo(rd1, 4);
    expect(result.tauRd2).toBeCloseTo(5.0914286, 4);
    expect(result.passesCompression).toBe(true);
    expect(result.passesPunching).toBe(tauSd <= rd1);
    expect(result.reinforcementRequired).toBe(false);
    expect(result.uniformApplied).toBe(false);
  });
});

describe("pilar interno com momentos nas duas direções", () => {
  it("soma as duas parcelas K·M / (Wp·d)", () => {
    const result = calculate(base({ mSdx: 30, mSdz: 20, bothSigns: true }));
    const r = 40;
    const u = 160 + 2 * Math.PI * r;
    const wp = wpInteriorClosed(40, 40, r);
    const tauF = (10 * 500) / (u * 20);
    const tauX = (10 * 0.6 * 30 * 100) / (wp * 20);
    const tauZ = (10 * 0.6 * 20 * 100) / (wp * 20);
    expect(result.kZ).toBeCloseTo(0.6, 6);
    expect(result.kX).toBeCloseTo(0.6, 6);
    expect(result.wpZ).toBeCloseTo(wp, 3);
    expect(result.wpX).toBeCloseTo(wp, 3);
    expect(result.tauSdCp).toBeCloseTo(tauF + tauX + tauZ, 4);
    expect(result.tauSdCp).toBeGreaterThan(tauF);
  });
});

describe("pilar de borda", () => {
  it("usa u*, e* e não extrapola MSd1 negativo", () => {
    const result = calculate(
      base({
        position: "borda",
        edgeAxis: "x",
        distZ: 0,
        cx: 50,
        cz: 40,
        fSd: 400,
        mSdx: 0,
        mSdz: 10,
      }),
    );
    const d = 20;
    const r = 2 * d;
    const cPar = 50;
    const cPerp = 40;
    const a = Math.min(1.5 * d, 0.5 * cPerp);
    const uStar = cPar + 2 * a + Math.PI * r;
    expect(result.uStar).toBeCloseTo(uStar, 1);
    expect(result.u).toBeCloseTo(2 * cPerp + cPar + Math.PI * r, 1);
    expect(result.u0).toBeCloseTo(cPar + 2 * cPerp, 4);

    const zL =
      cPar * cPerp +
      cPar * r +
      Math.PI * r * cPerp +
      2 * r * r +
      2 * a * cPerp -
      a * a;
    const eStar = zL / uStar - cPerp / 2;
    expect(result.eStarZ).toBeCloseTo(eStar, 1);
    expect(result.warnings.some((w) => w.text.includes("não foi extrapolado"))).toBe(true);
    const tauForceOnly = (10 * 400) / (uStar * d);
    expect(result.tauSdCp).toBeGreaterThan(tauForceOnly - 1e-6);
  });
});

describe("pilar de canto", () => {
  it("verifica cada borda em separado e adota a governante", () => {
    const result = calculate(
      base({
        position: "canto",
        distX: 0,
        distZ: 0,
        cx: 30,
        cz: 40,
        fSd: 250,
        mSdx: 5,
        mSdz: 40,
        bothSigns: true,
      }),
    );
    const d = 20;
    const r = 2 * d;
    const aX = Math.min(1.5 * d, 0.5 * 30);
    const aZ = Math.min(1.5 * d, 0.5 * 40);
    const uStar = aX + aZ + (Math.PI / 2) * r;
    expect(result.uStar).toBeCloseTo(uStar, 2);
    expect(result.u).toBeCloseTo(30 + 40 + (Math.PI / 2) * r, 2);
    expect(result.u0).toBeCloseTo(30 + 40, 4);
    expect(result.ok).toBe(true);
    expect(result.tauSdCp).toBeGreaterThan((10 * 250) / (uStar * d));
    const text = result.blocks.flatMap((b) => b.lines.map((l) => l.label)).join(" ");
    expect(text.toLowerCase()).toContain("canto");
  });
});

describe("armadura de punção", () => {
  const failing = base({
    fSd: 900,
    asx: 8,
    asz: 8,
    mSdx: 0,
    mSdz: 0,
  });

  it("sem armadura, acusa a necessidade e informa Asw/sr", () => {
    const result = calculate(failing);
    expect(result.passesCompression).toBe(true);
    expect(result.passesPunching).toBe(false);
    expect(result.reinforcementRequired).toBe(true);
    expect(result.overallPass).toBe(false);
    const joined = JSON.stringify(result.blocks);
    expect(joined.toLowerCase()).toContain("armadura de punção é necessária");
    expect(result.aswOverSr).not.toBeNull();
    expect(result.aswOverSr!).toBeGreaterThan(0);
    expect(result.aswAtSrMax!).toBeCloseTo(result.aswOverSr! * result.srMax, 6);

    const delta = result.tauSdCp - result.tauConcrete3;
    const fy = fywdEffective(23.5, 500, "studs").fywd;
    const expected = aswOverSrRequired(delta, result.uStar, fy, Math.PI / 2);
    expect(result.aswOverSr!).toBeCloseTo(expected, 4);
  });

  it("com armadura suficiente, passa em C' e em C''", () => {
    const without = calculate(failing);
    const withSteel = calculate({
      ...failing,
      punchingOn: true,
      punchingType: "studs",
      asw: 12,
      sr: 15,
      s0: 10,
      angulo: 90,
      nLinhas: 5,
      bitolaW: 8,
    });
    expect(without.reinforcementRequired).toBe(true);
    expect(withSteel.passesCompression).toBe(true);
    expect(withSteel.passesPunching).toBe(true);
    expect(withSteel.passesOuter).toBe(true);
    expect(withSteel.passesDetailing).toBe(true);
    expect(withSteel.overallPass).toBe(true);
    expect(withSteel.tauRd3!).toBeGreaterThan(withSteel.tauSdCp);
  });

  it("recupera o Asw do exemplo numérico de referência (u = 366 cm, sr = 10 cm)", () => {
    const u = 366;
    const sr = 10;
    const fywd = 300;
    // Exemplo com k sem o teto de 2 (redação usada no número arredondado 4,53 cm²).
    // A edição de 2023 limita k a 2; aqui confere-se só a inversão da parcela de aço.
    const k = 1 + Math.sqrt(20 / 18);
    const conc = 0.1 * k * Math.cbrt(100 * 0.005 * 30);
    const tauSd = 1.062;
    const asw = ((tauSd - conc) * u * sr) / (1.5 * fywd);
    expect(asw).toBeCloseTo(4.52, 2);
    expect(aswOverSrRequired(tauSd - conc, u, fywd, Math.PI / 2) * sr).toBeCloseTo(asw, 6);
  });
});

describe("exemplo padrão da interface", () => {
  it("fica próximo da fronteira: compressão passa e punção sem armadura não passa", () => {
    const result = calculate(defaultInput);
    expect(result.passesCompression).toBe(true);
    expect(result.passesPunching).toBe(false);
    expect(result.reinforcementRequired).toBe(true);
    expect(result.tauSdCp / result.tauRd1).toBeGreaterThan(1);
    expect(result.tauSdCp / result.tauRd1).toBeLessThan(1.35);
    expect(result.uniformApplied).toBe(false);
  });
});

describe("carga uniforme", () => {
  it("declara que FSd foi reduzido", () => {
    const result = calculate(base({ uniformOn: true, q: 10, fSd: 500 }));
    expect(result.fAtCp).toBeLessThan(500);
    expect(result.fAtC).toBeLessThan(500);
    const text = result.blocks.flatMap((b) => b.lines.map((l) => `${l.label} ${l.value ?? ""}`)).join("\n");
    expect(text).toContain("Aplicada");
  });
});
