import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  accumulatedSlabCoverage,
  compareVolumes,
  computeSlabMappedQuantity,
  computeVerticalMappedQuantity,
  detectRegionOverlaps,
  freehandToPolygon,
  intersectPolygons,
  metersPerPdfUnit,
  polygonArea,
  rectanglePolygon,
  unionPolygons,
} from "./geometry";

describe("MapaConcreto geometry", () => {
  it("computes rectangle area", () => {
    const poly = rectanglePolygon(0, 0, 8, 5); // 40 m²
    assert.equal(polygonArea(poly), 40);
  });

  it("acceptance: slab 40 m² ∩ 25 m² × 0.15 m → 62.5% and 3.75 m³", () => {
    const element = rectanglePolygon(0, 0, 8, 5); // 40
    const region = rectanglePolygon(0, 0, 5, 5); // 25
    const { area } = intersectPolygons(element, region);
    assert.ok(Math.abs(area - 25) < 1e-6);
    const qty = computeSlabMappedQuantity({
      elementAreaM2: 40,
      thicknessM: 0.15,
      intersectionAreaM2: area,
    });
    assert.ok(Math.abs(qty.percent - 62.5) < 1e-6);
    assert.ok(Math.abs(qty.volumeMappedM3 - 3.75) < 1e-6);
  });

  it("accumulated coverage uses union not percent sum", () => {
    const element = rectanglePolygon(0, 0, 10, 4); // 40
    const r1 = rectanglePolygon(0, 0, 5, 4); // 20
    const r2 = rectanglePolygon(3, 0, 5, 4); // overlaps r1 → union 32
    const acc = accumulatedSlabCoverage({
      elementPolygon: element,
      elementAreaM2: 40,
      thicknessM: 0.15,
      regionPolygons: [r1, r2],
    });
    assert.ok(Math.abs(acc.unionAreaM2 - 32) < 1e-6);
    assert.ok(Math.abs(acc.percent - 80) < 1e-6);
  });

  it("union of overlapping regions does not double-count", () => {
    const a = rectanglePolygon(0, 0, 2, 2);
    const b = rectanglePolygon(1, 0, 2, 2);
    const { area } = unionPolygons([a, b]);
    assert.ok(Math.abs(area - 6) < 1e-6);
  });

  it("scale calibration from two points", () => {
    const mpu = metersPerPdfUnit({
      p1: [0, 0],
      p2: [100, 0],
      realDistanceM: 5,
    });
    assert.equal(mpu, 0.05);
  });

  it("vertical without height is indeterminate", () => {
    const r = computeVerticalMappedQuantity({
      footprintAreaM2: 0.4,
      executedHeightM: null,
    });
    assert.equal(r.indeterminate, true);
    assert.equal(r.volumeMappedM3, null);
    assert.equal(r.meta.warnings[0]?.code, "vertical_height_required");
  });

  it("NF vs theoretical difference is not labeled as waste", () => {
    const c = compareVolumes({
      volumeTeoricoM3: 3.75,
      volumeEstimadoMapeadoM3: 3.75,
      volumeNfM3: 4.0,
      volumeAlocadoM3: 3.8,
      volumeDevolvidoM3: 0.2,
      volumeOutrosDestinosM3: 0,
    });
    assert.ok(Math.abs(c.diferencaNfTeorico - 0.25) < 1e-9);
    assert.match(c.labels.diferencaNfTeorico, /não é desperdício/i);
    assert.ok(Math.abs(c.saldoCarga - 0) < 1e-9);
  });

  it("freehand converts to closed polygon", () => {
    const { polygon, warnings } = freehandToPolygon([
      [0, 0],
      [2, 0],
      [2, 1],
      [0, 1],
    ]);
    assert.ok(polygon);
    assert.ok(polygonArea(polygon!) > 0);
    assert.ok(warnings.some((w) => w.code === "freehand_auto_closed"));
  });

  it("detects overlapping regions", () => {
    const overlaps = detectRegionOverlaps([
      { id: "a", polygon: rectanglePolygon(0, 0, 5, 5) },
      { id: "b", polygon: rectanglePolygon(3, 0, 5, 5) },
    ]);
    assert.equal(overlaps.length, 1);
    assert.ok(Math.abs(overlaps[0].overlapAreaM2 - 10) < 1e-6);
  });
});
