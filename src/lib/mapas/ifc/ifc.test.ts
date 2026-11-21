import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseIfcStep, splitStepArgs } from "./parse-step";

describe("MapaConcreto IFC STEP parser", () => {
  it("splitStepArgs respects nested parentheses and quotes", () => {
    const args = splitStepArgs("'a,b',(#1,#2),$,.FLOOR.");
    assert.equal(args.length, 4);
    assert.equal(args[0], "'a,b'");
    assert.equal(args[1], "(#1,#2)");
  });

  it("parses demo laje fixture with GUID and Qto volume (no invented volume)", () => {
    const path = resolve(
      process.cwd(),
      "fixtures/mapas/demo-laje-40m2.ifc",
    );
    const text = readFileSync(path, "utf8");
    const result = parseIfcStep(text, { isDemo: true });
    assert.equal(result.ok, true);
    assert.equal(result.schema, "IFC4");
    assert.equal(result.unit.toMeters, 1);
    assert.ok(result.elements.length >= 1);
    const slab = result.elements.find((e) => e.kind === "laje");
    assert.ok(slab);
    assert.equal(slab!.guid, "2GuidSlabDemoLaje40m2X");
    assert.equal(slab!.name, "LJ-40");
    assert.equal(slab!.volumeM3, 6);
    assert.equal(slab!.areaM2, 40);
    assert.ok(slab!.quantityOrigin?.includes("GrossVolume"));
    assert.ok(slab!.footprint);
    assert.equal(result.isDemo, true);
  });

  it("does not invent volume when Qto is absent", () => {
    const minimal = `ISO-10303-21;
HEADER;FILE_SCHEMA(('IFC4'));ENDSEC;
DATA;
#1=IFCPROJECT('p',$,'P',$,$,$,$,$,$);
#11=IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.);
#10=IFCUNITASSIGNMENT((#11));
#100=IFCSLAB('GuidNoQty000000000001',$,'S1',$,$,$,$,$,.FLOOR.);
ENDSEC;END-ISO-10303-21;`;
    const result = parseIfcStep(minimal);
    assert.equal(result.elements.length, 1);
    assert.equal(result.elements[0].volumeM3, null);
    assert.ok(
      result.elements[0].warnings.some((w) =>
        w.toLowerCase().includes("não inventado"),
      ),
    );
  });
});
