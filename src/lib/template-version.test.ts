import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  compareTemplateVersions,
  runUsesFrozenVersion,
} from "./template-version";

describe("template version compare", () => {
  it("detects added/removed/changed between v1 and v2", () => {
    const v1 = {
      version_number: 1,
      status: "published",
      items: [
        {
          code: "VIG-01",
          title: "A",
          priority: "alta",
          is_blocking: true,
        },
        {
          code: "VIG-02",
          title: "B",
          priority: "media",
          is_blocking: false,
        },
      ],
    };
    const v2 = {
      version_number: 2,
      status: "draft",
      items: [
        {
          code: "VIG-01",
          title: "A revisado",
          priority: "alta",
          is_blocking: true,
        },
        {
          code: "VIG-03",
          title: "C",
          priority: "baixa",
          is_blocking: false,
        },
      ],
    };
    const diff = compareTemplateVersions(v1, v2);
    assert.deepEqual(diff.added, ["VIG-03"]);
    assert.deepEqual(diff.removed, ["VIG-02"]);
    assert.equal(diff.changed.length, 1);
    assert.equal(diff.changed[0].code, "VIG-01");
    assert.ok(diff.changed[0].fields.includes("title"));
  });

  it("marks historical runs as frozen when current version differs", () => {
    assert.equal(
      runUsesFrozenVersion("ver-1", "ver-2"),
      "frozen_historical",
    );
    assert.equal(runUsesFrozenVersion("ver-2", "ver-2"), "current");
  });
});
