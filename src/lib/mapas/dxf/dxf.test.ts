import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { resolve } from "path";
import { resolveInsunits } from "./units";
import { parseAsciiDxf } from "./parse-ascii";
import { dxfTextToCadModel, findClosedPolygonAreaM2 } from "./to-internal";

const DEMO = resolve(
  process.cwd(),
  "fixtures/mapas/demo-laje-40m2.dxf",
);

describe("MapaConcreto DXF units", () => {
  it("maps INSUNITS 6 to meters", () => {
    const u = resolveInsunits(6);
    assert.equal(u.toMeters, 1);
    assert.equal(u.label, "meters");
  });

  it("maps millimeters", () => {
    assert.equal(resolveInsunits(4).toMeters, 0.001);
  });

  it("warns when missing", () => {
    const u = resolveInsunits(null);
    assert.ok(u.warnings.length > 0);
  });
});

describe("MapaConcreto DXF demo fixture", () => {
  const text = readFileSync(DEMO, "utf8");

  it("parses layers including LAJE/EIXOS/PILARES", () => {
    const p = parseAsciiDxf(text);
    const names = p.layers.map((l) => l.name);
    assert.ok(names.includes("LAJE"));
    assert.ok(names.includes("EIXOS"));
    assert.ok(names.includes("PILARES"));
    assert.equal(p.insunits, 6);
  });

  it("expands INSERT block with scale", () => {
    const p = parseAsciiDxf(text);
    const pilares = p.entities.filter((e) => e.layer === "PILARES");
    assert.ok(pilares.length >= 2, "expected expanded pillar polylines");
  });

  it("converts LAJE closed polyline to 40 m² polygon in meters", () => {
    const model = dxfTextToCadModel(text, { isDemo: true });
    assert.equal(model.isDemo, true);
    assert.equal(model.units.toMeters, 1);
    const area = findClosedPolygonAreaM2(model, "LAJE");
    assert.ok(area != null);
    assert.ok(Math.abs(area! - 40) < 1e-6);
    assert.ok(
      model.warnings.some((w) => /não.*automaticamente|CSV/i.test(w)),
    );
  });

  it("does not invent structural element records", () => {
    const model = dxfTextToCadModel(text, { isDemo: true });
    // CadModel has entities only — no element kind/volume fields
    assert.ok(model.entities.every((e) => !("volume_teorico_m3" in e)));
  });
});
