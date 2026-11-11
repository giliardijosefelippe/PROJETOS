import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  elementsCsvTemplate,
  parseElementsCsv,
} from "./csv-elements";

describe("MapaConcreto CSV elements", () => {
  it("parses template with laje and pilar", () => {
    const { rows, errors } = parseElementsCsv(elementsCsvTemplate());
    assert.equal(errors.length, 0);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].code, "LJ-01");
    assert.equal(rows[0].area_m2, 40);
    assert.equal(rows[0].thickness_m, 0.15);
    assert.equal(rows[1].kind, "pilar");
    assert.equal(rows[1].height_m, 2.8);
  });

  it("requires code and name", () => {
    const { errors } = parseElementsCsv("area_m2\n40\n");
    assert.ok(errors.some((e) => /code/i.test(e)));
  });

  it("does not invent missing numbers", () => {
    const { rows, errors } = parseElementsCsv(
      "code,name,kind\nX-1,Sem dims,laje\n",
    );
    assert.equal(errors.length, 0);
    assert.equal(rows[0].area_m2, null);
    assert.equal(rows[0].thickness_m, null);
  });
});
