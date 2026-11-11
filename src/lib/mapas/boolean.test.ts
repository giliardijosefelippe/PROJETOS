import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { polygonArea, rectanglePolygon } from "./geometry";
import {
  analyzeRegionConflicts,
  accumulatedIntersectionWithVoids,
  classifyContainment,
  differencePolygons,
  polygonWithHoles,
  subtractVoids,
} from "./boolean";

describe("MapaConcreto boolean ops", () => {
  it("polygonWithHoles subtracts void area", () => {
    const outer = rectanglePolygon(0, 0, 10, 10)[0];
    const hole = rectanglePolygon(2, 2, 2, 2)[0];
    const poly = polygonWithHoles(outer, [hole]);
    assert.ok(Math.abs(polygonArea(poly) - 96) < 1e-6);
  });

  it("differencePolygons removes overlap", () => {
    const a = rectanglePolygon(0, 0, 4, 4);
    const b = rectanglePolygon(2, 0, 4, 4);
    const { area } = differencePolygons(a, b);
    assert.ok(Math.abs(area - 8) < 1e-6);
  });

  it("subtractVoids yields net area", () => {
    const region = rectanglePolygon(0, 0, 8, 5); // 40
    const voidPoly = rectanglePolygon(1, 1, 2, 2); // 4
    const { area, warnings } = subtractVoids(region, [voidPoly]);
    assert.ok(Math.abs(area - 36) < 1e-6);
    assert.ok(warnings.some((w) => w.code === "voids_applied"));
  });

  it("classifyContainment detects full / partial / outside", () => {
    const region = rectanglePolygon(0, 0, 5, 5);
    const inside = rectanglePolygon(1, 1, 1, 1);
    const partial = rectanglePolygon(4, 0, 2, 2);
    const outside = rectanglePolygon(10, 10, 1, 1);
    assert.equal(
      classifyContainment(region, inside).classification,
      "fully_contained",
    );
    assert.equal(
      classifyContainment(region, partial).classification,
      "partially_intersects",
    );
    assert.equal(
      classifyContainment(region, outside).classification,
      "outside",
    );
  });

  it("analyzeRegionConflicts prefers union over sum", () => {
    const a = rectanglePolygon(0, 0, 5, 4); // 20
    const b = rectanglePolygon(3, 0, 5, 4); // 20 overlap 8 → union 32
    const r = analyzeRegionConflicts([
      { id: "a", polygon: a, name: "A" },
      { id: "b", polygon: b, name: "B" },
    ]);
    assert.ok(r.conflicts.length >= 1);
    assert.ok(Math.abs(r.unionAreaM2 - 32) < 1e-6);
    assert.ok(Math.abs(r.doubleCountRiskM2 - 8) < 1e-6);
    assert.equal(r.conflicts[0].accounting, "use_union");
  });

  it("accumulatedIntersectionWithVoids uses union", () => {
    const element = rectanglePolygon(0, 0, 10, 4); // 40
    const r1 = rectanglePolygon(0, 0, 5, 4);
    const r2 = rectanglePolygon(3, 0, 5, 4);
    const acc = accumulatedIntersectionWithVoids({
      element,
      regions: [{ polygon: r1 }, { polygon: r2 }],
    });
    assert.ok(Math.abs(acc.unionAreaM2 - 32) < 1e-6);
    assert.ok(acc.sumIntersectionAreaM2 > acc.unionAreaM2);
  });
});
