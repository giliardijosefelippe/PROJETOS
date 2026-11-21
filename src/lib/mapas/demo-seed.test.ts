import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  DEMO_BUILDING_CODE,
  DEMO_SITE_CODE,
  demoAcceptancePlan,
} from "./demo-fixtures";

describe("MapaConcreto demo seed plan (offline)", () => {
  it("locks acceptance numbers 62.5% / 3.75 m³", () => {
    const plan = demoAcceptancePlan();
    assert.equal(plan.slab.areaM2, 40);
    assert.equal(plan.slab.thicknessM, 0.15);
    assert.equal(plan.acceptance.percent, 62.5);
    assert.equal(plan.acceptance.volumeM3, 3.75);
    assert.equal(plan.unionAreaM2, 40);
  });

  it("declares stable idempotent keys for re-seed", () => {
    const plan = demoAcceptancePlan();
    assert.equal(DEMO_SITE_CODE, "DEMO-MC-001");
    assert.equal(DEMO_BUILDING_CODE, "T-DEMO");
    assert.deepEqual(plan.idempotentKeys.pours, ["C-DEMO-01", "C-DEMO-02"]);
    assert.ok(plan.idempotentKeys.elements.includes("P-DEMO-01"));
  });
});
