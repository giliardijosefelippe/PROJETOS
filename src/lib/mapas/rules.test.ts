import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  computeBeamMappedQuantity,
  computeColumnMappedQuantity,
  computeFoundationMappedQuantity,
} from "./rules";

describe("MapaConcreto parameterized rules", () => {
  it("beam requires executed length and section — no invent", () => {
    const r = computeBeamMappedQuantity({
      axisLengthM: 10,
      executedLengthM: null,
      sectionAreaM2: 0.3,
      planIntersectionLengthM: 4,
    });
    assert.equal(r.indeterminate, true);
    assert.equal(r.volumeEstimadoM3, null);
    assert.ok(
      r.method.warnings.some((w) => w.code === "beam_missing_executed_length"),
    );
    assert.ok(
      r.method.warnings.some((w) => w.code === "beam_plan_length_insufficient"),
    );
  });

  it("beam computes volume and percent with memory", () => {
    const r = computeBeamMappedQuantity({
      axisLengthM: 10,
      executedLengthM: 4,
      sectionAreaM2: 0.25,
    });
    assert.equal(r.indeterminate, false);
    assert.ok(Math.abs((r.volumeEstimadoM3 || 0) - 1) < 1e-9);
    assert.ok(Math.abs((r.percent || 0) - 40) < 1e-9);
    assert.ok(r.steps.length >= 2);
  });

  it("column without height is indeterminate", () => {
    const r = computeColumnMappedQuantity({
      footprintAreaM2: 0.4,
      executedHeightM: null,
    });
    assert.equal(r.indeterminate, true);
    assert.equal(r.volumeEstimadoM3, null);
    assert.ok(
      r.method.warnings.some((w) => w.code === "vertical_height_required"),
    );
  });

  it("column with levels derives height", () => {
    const r = computeColumnMappedQuantity({
      footprintAreaM2: 0.5,
      executedHeightM: null,
      levelStartM: 0,
      levelEndM: 3,
    });
    assert.equal(r.indeterminate, false);
    assert.ok(Math.abs((r.volumeEstimadoM3 || 0) - 1.5) < 1e-9);
  });

  it("foundation constant thickness with memory", () => {
    const r = computeFoundationMappedQuantity({
      kind: "sapata",
      footprintAreaM2: 4,
      thicknessM: 0.5,
      intersectionAreaM2: 2,
    });
    assert.ok(Math.abs((r.percent || 0) - 50) < 1e-9);
    assert.ok(Math.abs((r.volumeEstimadoM3 || 0) - 1) < 1e-9);
    assert.ok(r.steps.some((s) => s.formula.includes("area(I)")));
  });

  it("foundation without thickness does not invent volume", () => {
    const r = computeFoundationMappedQuantity({
      kind: "fundacao",
      footprintAreaM2: 4,
      thicknessM: null,
      intersectionAreaM2: 2,
    });
    assert.equal(r.volumeEstimadoM3, null);
    assert.ok(
      r.method.warnings.some((w) => w.code === "foundation_missing_thickness"),
    );
  });
});
