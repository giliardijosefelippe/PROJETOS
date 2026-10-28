import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { filterVisibleItems, isItemVisible } from "./conditionals";

describe("conditionals", () => {
  it("show_if requires matching status", () => {
    const rule = {
      show_if: {
        item_code: "VIG-01",
        status_in: ["conforme" as const],
      },
    };
    assert.equal(isItemVisible(rule, { "VIG-01": "conforme" }), true);
    assert.equal(isItemVisible(rule, { "VIG-01": "nao_conforme" }), false);
    assert.equal(isItemVisible(rule, {}), false);
  });

  it("hide_if hides when match", () => {
    const rule = {
      hide_if: {
        item_code: "VIG-01",
        status_in: ["nao_aplicavel" as const],
      },
    };
    assert.equal(isItemVisible(rule, { "VIG-01": "nao_aplicavel" }), false);
    assert.equal(isItemVisible(rule, { "VIG-01": "conforme" }), true);
  });

  it("filters list", () => {
    const items = [
      { code: "A", conditional_rules: null },
      {
        code: "B",
        conditional_rules: {
          show_if: { item_code: "A", status_in: ["conforme" as const] },
        },
      },
    ];
    assert.equal(filterVisibleItems(items, { A: "nao_iniciado" }).length, 1);
    assert.equal(filterVisibleItems(items, { A: "conforme" }).length, 2);
  });
});
