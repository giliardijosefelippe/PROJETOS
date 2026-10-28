import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { validateUpload } from "./upload";

describe("upload validation", () => {
  it("rejects empty", () => {
    const r = validateUpload("evidence", null);
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "UPLOAD_EMPTY");
  });

  it("rejects wrong mime", () => {
    const r = validateUpload("evidence", {
      type: "application/zip",
      size: 100,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "UPLOAD_MIME");
  });

  it("rejects oversized", () => {
    const r = validateUpload("logo", {
      type: "image/png",
      size: 10 * 1024 * 1024,
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "UPLOAD_SIZE");
  });

  it("accepts valid evidence", () => {
    const r = validateUpload("evidence", {
      type: "image/jpeg",
      size: 1024,
      name: "foto.jpg",
    });
    assert.equal(r.ok, true);
  });
});
