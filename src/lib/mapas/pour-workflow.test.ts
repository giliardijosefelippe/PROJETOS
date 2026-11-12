import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allowedPourTransitions,
  canTransitionPourStatus,
  structuralApprovalDisclaimer,
} from "./pour-workflow";

describe("MapaConcreto pour workflow", () => {
  it("allows planejada → em_execucao", () => {
    const r = canTransitionPourStatus("planejada", "em_execucao");
    assert.equal(r.ok, true);
  });

  it("blocks planejada → conforme", () => {
    const r = canTransitionPourStatus("planejada", "conforme", "ok");
    assert.equal(r.ok, false);
    if (!r.ok) assert.equal(r.code, "TRANSITION_FORBIDDEN");
  });

  it("requires justification for conforme and disclaimer is explicit", () => {
    const bad = canTransitionPourStatus("em_analise", "conforme", "");
    assert.equal(bad.ok, false);
    if (!bad.ok) assert.equal(bad.code, "JUSTIFICATION_REQUIRED");
    const ok = canTransitionPourStatus(
      "em_analise",
      "conforme",
      "Documentação e ensaios ok — sem aprovação estrutural",
    );
    assert.equal(ok.ok, true);
    assert.ok(structuralApprovalDisclaimer().includes("aprovação estrutural"));
  });

  it("lists allowed transitions from em_execucao", () => {
    const list = allowedPourTransitions("em_execucao");
    assert.ok(list.includes("aguardando_ensaios"));
    assert.ok(!list.includes("conforme"));
  });
});
