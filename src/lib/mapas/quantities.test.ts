import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { toGeoJsonPolygon, rectanglePolygon } from "./geometry";
import {
  compareVolumes,
  computeAccumulatedForElement,
  computeRegionElementIntersection,
} from "./quantities";

describe("MapaConcreto quantities", () => {
  it("maps slab region intersection for acceptance case", () => {
    const elementGeom = toGeoJsonPolygon(rectanglePolygon(0, 0, 8, 5));
    const regionGeom = toGeoJsonPolygon(rectanglePolygon(0, 0, 5, 5));
    const result = computeRegionElementIntersection(
      { id: "r1", geometry: regionGeom, area_m2: 25 },
      {
        id: "e1",
        kind: "laje",
        geometry: elementGeom,
        area_m2: 40,
        thickness_m: 0.15,
        height_m: null,
        volume_teorico_m3: 6,
      },
    );
    assert.ok(Math.abs((result.percent || 0) - 62.5) < 1e-6);
    assert.ok(Math.abs((result.volumeEstimadoM3 || 0) - 3.75) < 1e-6);
    assert.equal(result.indeterminate, false);
  });

  it("marks pillar without height as indeterminate", () => {
    const result = computeRegionElementIntersection(
      {
        id: "r1",
        geometry: toGeoJsonPolygon(rectanglePolygon(0, 0, 1, 1)),
        area_m2: 1,
      },
      {
        id: "e1",
        kind: "pilar",
        geometry: toGeoJsonPolygon(rectanglePolygon(0, 0, 0.4, 0.4)),
        area_m2: 0.16,
        thickness_m: null,
        height_m: null,
        volume_teorico_m3: null,
      },
    );
    assert.equal(result.indeterminate, true);
    assert.equal(result.volumeEstimadoM3, null);
  });

  it("accumulates two pour stages without double counting", () => {
    const elementGeom = toGeoJsonPolygon(rectanglePolygon(0, 0, 10, 4));
    const acc = computeAccumulatedForElement(
      {
        id: "e1",
        kind: "laje",
        geometry: elementGeom,
        area_m2: 40,
        thickness_m: 0.15,
        height_m: null,
        volume_teorico_m3: 6,
      },
      [
        {
          id: "r1",
          geometry: toGeoJsonPolygon(rectanglePolygon(0, 0, 5, 4)),
          area_m2: 20,
        },
        {
          id: "r2",
          geometry: toGeoJsonPolygon(rectanglePolygon(3, 0, 5, 4)),
          area_m2: 20,
        },
      ],
    );
    assert.ok(acc);
    assert.ok(Math.abs(acc!.percent - 80) < 1e-6);
  });

  it("compareVolumes never implies waste", () => {
    const c = compareVolumes({
      volumeTeoricoM3: 10,
      volumeEstimadoMapeadoM3: 9,
      volumeNfM3: 11,
      volumeAlocadoM3: 10,
      volumeDevolvidoM3: 1,
      volumeOutrosDestinosM3: 0,
    });
    assert.match(c.labels.diferencaNfTeorico, /não é desperdício/i);
  });
});
