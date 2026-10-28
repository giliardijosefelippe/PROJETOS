import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canApproveRevision,
  canTransitionIssue,
} from "./approval";

const baseItem = {
  id: "1",
  code: "VIG-01",
  title: "x",
  is_blocking: true,
  priority: "alta",
  status: "conforme" as const,
};

describe("approval / reconference", () => {
  it("blocks self-approval", () => {
    const r = canApproveRevision({
      actorId: "u1",
      productionOwnerId: "u1",
      immutable: false,
      items: [baseItem],
      openIssueStatuses: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "SELF_APPROVAL");
  });

  it("blocks when immutable", () => {
    const r = canApproveRevision({
      actorId: "reviewer",
      productionOwnerId: "drawer",
      immutable: true,
      items: [baseItem],
      openIssueStatuses: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "IMMUTABLE_REVISION");
  });

  it("blocks open blockers without exception", () => {
    const r = canApproveRevision({
      actorId: "reviewer",
      productionOwnerId: "drawer",
      immutable: false,
      items: [{ ...baseItem, status: "nao_conforme" }],
      openIssueStatuses: [],
    });
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "BLOCKING_OPEN");
  });

  it("allows with formal exception (does not claim conformity)", () => {
    const r = canApproveRevision({
      actorId: "reviewer",
      productionOwnerId: "drawer",
      immutable: false,
      items: [{ ...baseItem, status: "nao_conforme" }],
      openIssueStatuses: ["aberta"],
      exceptionNote: "Aceite excepcional documentado pela coordenação",
    });
    assert.equal(r.ok, true);
    if (r.ok) {
      assert.ok(r.exceptionRecords.length === 1);
      assert.match(
        String(r.exceptionRecords[0].disclaimer),
        /não transforma erro técnico em conformidade/i,
      );
    }
  });

  it("happy path approval when clean", () => {
    const r = canApproveRevision({
      actorId: "reviewer",
      productionOwnerId: "drawer",
      immutable: false,
      items: [baseItem],
      openIssueStatuses: ["resolvida"],
    });
    assert.equal(r.ok, true);
  });

  it("issue transitions for reconference loop", () => {
    assert.equal(canTransitionIssue("aberta", "em_correcao"), true);
    assert.equal(
      canTransitionIssue("em_correcao", "aguardando_reconferencia"),
      true,
    );
    assert.equal(
      canTransitionIssue("aguardando_reconferencia", "resolvida"),
      true,
    );
    assert.equal(canTransitionIssue("resolvida", "reaberta"), true);
    assert.equal(canTransitionIssue("resolvida", "aberta"), false);
  });
});
