import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { rectanglePolygon, toGeoJsonPolygon } from "./geometry";
import { compareRevisionRegions } from "./revision-reconcile";

function rectRegion(
  id: string,
  name: string,
  rev: string,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const poly = rectanglePolygon(x, y, w, h);
  return {
    id,
    name,
    drawingRevisionId: rev,
    geometry: toGeoJsonPolygon(poly),
    areaM2: w * h,
  };
}

describe("MapaConcreto revision reconcile", () => {
  it("marks orphan when target has no matching region", () => {
    const report = compareRevisionRegions({
      sourceRevisionId: "src",
      targetRevisionId: "tgt",
      sourceRegions: [rectRegion("s1", "A", "src", 0, 0, 8, 5)],
      targetRegions: [],
    });
    assert.equal(report.summary.orphan, 1);
    assert.equal(report.proposals[0].status, "orphan_on_source");
    assert.equal(report.proposals[0].suggestedAction, "copy_to_target");
    assert.ok(
      report.notes.some((n) =>
        n.includes("não são reposicionados automaticamente"),
      ),
    );
  });

  it("detects matched geometry without moving anything", () => {
    const report = compareRevisionRegions({
      sourceRevisionId: "src",
      targetRevisionId: "tgt",
      sourceRegions: [rectRegion("s1", "A", "src", 0, 0, 8, 5)],
      targetRegions: [rectRegion("t1", "A-nova", "tgt", 0, 0, 8, 5)],
    });
    assert.equal(report.summary.matched, 1);
    assert.equal(report.proposals[0].status, "matched_geometry");
    assert.equal(report.proposals[0].targetRegionId, "t1");
    assert.equal(report.proposals[0].suggestedAction, "reassociate");
  });

  it("prefers same normalized name when two targets overlap similarly", () => {
    const report = compareRevisionRegions({
      sourceRevisionId: "src",
      targetRevisionId: "tgt",
      sourceRegions: [rectRegion("s1", "Região Norte", "src", 0, 0, 8, 5)],
      targetRegions: [
        rectRegion("t-other", "Outra", "tgt", 0.2, 0, 8, 5),
        rectRegion("t-name", "Regiao Norte", "tgt", 0.1, 0, 8, 5),
      ],
    });
    assert.equal(report.proposals[0].targetRegionId, "t-name");
  });

  it("flags displaced candidate when overlap partial and shift small", () => {
    const report = compareRevisionRegions({
      sourceRevisionId: "src",
      targetRevisionId: "tgt",
      sourceRegions: [rectRegion("s1", "A", "src", 0, 0, 8, 5)],
      // shifted 1m in X, still overlaps strongly
      targetRegions: [rectRegion("t1", "A'", "tgt", 1, 0, 8, 5)],
    });
    assert.equal(report.summary.displaced, 1);
    assert.equal(report.proposals[0].status, "displaced_candidate");
    assert.equal(report.proposals[0].suggestedAction, "review");
    assert.ok((report.proposals[0].centroidShiftM ?? 0) > 0.1);
  });

  it("lists target-only regions as already_on_target", () => {
    const report = compareRevisionRegions({
      sourceRevisionId: "src",
      targetRevisionId: "tgt",
      sourceRegions: [],
      targetRegions: [rectRegion("t1", "Nova", "tgt", 0, 0, 2, 2)],
    });
    assert.equal(report.summary.alreadyOnTarget, 1);
    assert.equal(report.proposals[0].status, "already_on_target");
    assert.equal(report.proposals[0].suggestedAction, "none");
  });

  it("ignores archived source regions", () => {
    const archived = {
      ...rectRegion("s1", "Old", "src", 0, 0, 4, 4),
      archivedAt: "2026-01-01T00:00:00Z",
    };
    const report = compareRevisionRegions({
      sourceRevisionId: "src",
      targetRevisionId: "tgt",
      sourceRegions: [archived],
      targetRegions: [],
    });
    assert.equal(report.summary.orphan, 0);
    assert.equal(report.proposals.length, 0);
  });
});
