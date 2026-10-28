import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  CHECKLIST_CSV_TEMPLATE,
  checklistItemsToCsv,
  parseChecklistCsv,
} from "./spreadsheet";

describe("spreadsheet import/export", () => {
  it("round-trips template CSV", () => {
    const { rows, errors } = parseChecklistCsv(CHECKLIST_CSV_TEMPLATE);
    assert.equal(errors.length, 0);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].code, "EX-01");
    assert.equal(rows[0].is_blocking, false);
  });

  it("rejects missing required columns", () => {
    const { errors } = parseChecklistCsv("a,b\n1,2");
    assert.ok(errors[0]?.includes("obrigatória"));
  });

  it("exports items to csv with header", () => {
    const csv = checklistItemsToCsv([
      {
        section_title: "S",
        code: "A-1",
        title: "Título, com vírgula",
        steps: ["um", "dois"],
        priority: "alta",
        is_blocking: true,
      },
    ]);
    assert.ok(csv.includes("section_title"));
    assert.ok(csv.includes('"Título, com vírgula"'));
    assert.ok(csv.includes("um | dois"));
  });
});
