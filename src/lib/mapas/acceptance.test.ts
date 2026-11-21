import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { ACCEPTANCE_CHECKLIST, acceptanceSummary } from "./acceptance";

describe("MapaConcreto acceptance §12", () => {
  it("lists all 12 criteria with evidence", () => {
    assert.equal(ACCEPTANCE_CHECKLIST.length, 12);
    for (const item of ACCEPTANCE_CHECKLIST) {
      assert.ok(item.id.startsWith("12."));
      assert.ok(item.criterion.length > 10);
      assert.ok(item.evidence.length > 5);
    }
  });

  it("summary marks code-ready when no blocking env-only rows", () => {
    const s = acceptanceSummary();
    assert.equal(s.total, 12);
    assert.ok(s.covered >= 8);
    assert.equal(s.readyInCode, true);
  });
});
