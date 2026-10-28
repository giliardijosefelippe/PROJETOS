import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { canSeeOrgRow, roleCan } from "./rls-matrix";

describe("RLS / permissions matrix", () => {
  it("consulta cannot write templates or approve", () => {
    assert.equal(roleCan("consulta", "templates_write"), false);
    assert.equal(roleCan("consulta", "approvals_insert"), false);
    assert.equal(roleCan("consulta", "consulta_read"), true);
  });

  it("desenhista can write drawings/runs but not templates", () => {
    assert.equal(roleCan("desenhista", "drawings_write"), true);
    assert.equal(roleCan("desenhista", "runs_write"), true);
    assert.equal(roleCan("desenhista", "templates_write"), false);
    assert.equal(roleCan("desenhista", "approvals_insert"), false);
  });

  it("conferente can approve; only admin manages branding", () => {
    assert.equal(roleCan("conferente", "approvals_insert"), true);
    assert.equal(roleCan("conferente", "branding_logo"), false);
    assert.equal(roleCan("admin", "branding_logo"), true);
  });

  it("isolates rows by active membership org", () => {
    const memberships = [
      { user_id: "u1", organization_id: "org-a", status: "active" },
      { user_id: "u1", organization_id: "org-b", status: "disabled" },
      { user_id: "u2", organization_id: "org-b", status: "active" },
    ];
    assert.equal(
      canSeeOrgRow({
        userId: "u1",
        rowOrgId: "org-a",
        memberships,
      }),
      true,
    );
    assert.equal(
      canSeeOrgRow({
        userId: "u1",
        rowOrgId: "org-b",
        memberships,
      }),
      false,
    );
    assert.equal(
      canSeeOrgRow({
        userId: "u2",
        rowOrgId: "org-a",
        memberships,
      }),
      false,
    );
  });
});
