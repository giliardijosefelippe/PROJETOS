import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { computeSiteIndicators } from "./indicators";

describe("MapaConcreto indicators", () => {
  it("aggregates volumes and flags pour without NF", () => {
    const r = computeSiteIndicators({
      siteId: "site-1",
      volumeTeoricoM3: 10,
      volumeEstimadoMapeadoM3: 6,
      pours: [
        {
          id: "p1",
          code: "C-01",
          status: "em_execucao",
          floorId: null,
          pourDate: "2026-11-01",
          volumePlannedM3: 5,
        },
      ],
      deliveries: [],
      occurrences: [],
      drawings: [],
    });
    assert.equal(r.volumeTeoricoM3, 10);
    assert.ok(r.coverageRatio != null && Math.abs(r.coverageRatio - 0.6) < 1e-9);
    assert.ok(r.pendencias.some((p) => p.code === "pour_sem_nf"));
    assert.ok(r.notes.some((n) => n.includes("desperdício")));
  });

  it("filters by period and floor", () => {
    const r = computeSiteIndicators({
      siteId: "site-1",
      floorId: "f1",
      periodFrom: "2026-11-01",
      periodTo: "2026-11-30",
      volumeTeoricoM3: 1,
      volumeEstimadoMapeadoM3: 1,
      pours: [
        {
          id: "p1",
          code: "A",
          status: "conforme",
          floorId: "f1",
          pourDate: "2026-11-10",
          volumePlannedM3: 1,
        },
        {
          id: "p2",
          code: "B",
          status: "em_execucao",
          floorId: "f2",
          pourDate: "2026-11-10",
          volumePlannedM3: 9,
        },
        {
          id: "p3",
          code: "C",
          status: "em_execucao",
          floorId: "f1",
          pourDate: "2026-10-01",
          volumePlannedM3: 9,
        },
      ],
      deliveries: [
        {
          pourId: "p1",
          volumeNfM3: 1.2,
          volumeReturnedM3: 0,
          volumeOtherM3: 0,
          allocatedM3: 1,
        },
      ],
      occurrences: [],
      drawings: [],
    });
    assert.equal(r.volumePlanejadoPoursM3, 1);
    assert.equal(r.volumeNfM3, 1.2);
    assert.ok(Math.abs(r.volumeAlocadoM3 - 1) < 1e-9);
  });

  it("flags unallocated balance without calling it waste", () => {
    const r = computeSiteIndicators({
      siteId: "s",
      volumeTeoricoM3: 0,
      volumeEstimadoMapeadoM3: 0,
      pours: [
        {
          id: "p1",
          code: "C",
          status: "em_execucao",
          floorId: null,
          pourDate: "2026-11-01",
          volumePlannedM3: null,
        },
      ],
      deliveries: [
        {
          pourId: "p1",
          volumeNfM3: 10,
          volumeReturnedM3: 0,
          volumeOtherM3: 0,
          allocatedM3: 7,
        },
      ],
      occurrences: [],
      drawings: [{ id: "d1", metersPerPdfUnit: null, sourceKind: "pdf" }],
    });
    assert.ok(r.pendencias.some((p) => p.code === "saldo_nao_alocado"));
    assert.ok(r.pendencias.some((p) => p.code === "escala_pendente"));
  });
});
