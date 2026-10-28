import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareRevisionResponses,
  summarizeDiff,
} from "./revision-compare";

describe("revision compare", () => {
  it("detects added removed and status changes", () => {
    const diff = compareRevisionResponses(
      [
        { code: "A", title: "a", status: "conforme" },
        { code: "B", title: "b", status: "nao_conforme", comment: "x" },
      ],
      [
        { code: "A", title: "a", status: "conforme" },
        { code: "B", title: "b", status: "conforme", comment: "corrigido" },
        { code: "C", title: "c", status: "nao_iniciado" },
      ],
    );
    const summary = summarizeDiff(diff);
    assert.equal(summary.added, 1);
    assert.equal(summary.status_changed, 1);
    assert.equal(summary.unchanged, 1);
    assert.equal(summary.removed, 0);
  });
});
