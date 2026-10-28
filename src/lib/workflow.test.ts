import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  computeIndicators,
  findBlockingProblems,
  validateResponseComment,
} from "./workflow";

describe("workflow", () => {
  it("allows production to awaiting conference", () => {
    assert.equal(canTransition("em_producao", "aguardando_conferencia"), true);
    assert.equal(canTransition("aprovado_emissao", "em_producao"), false);
  });

  it("requires comments for NA and NC", () => {
    assert.match(
      validateResponseComment("nao_aplicavel", "") || "",
      /Justificativa/,
    );
    assert.match(
      validateResponseComment("nao_conforme", "  ") || "",
      /Comentário/,
    );
    assert.equal(validateResponseComment("conforme", ""), null);
  });

  it("finds blocking problems", () => {
    const problems = findBlockingProblems([
      {
        id: "1",
        code: "A",
        title: "x",
        is_blocking: true,
        priority: "media",
        status: "nao_conforme",
      },
      {
        id: "2",
        code: "B",
        title: "y",
        is_blocking: false,
        priority: "critica",
        status: "pendente_verificacao",
      },
      {
        id: "3",
        code: "C",
        title: "z",
        is_blocking: false,
        priority: "baixa",
        status: "conforme",
      },
    ]);
    assert.equal(problems.length, 2);
  });

  it("computes conformidade with explicit denominator", () => {
    const ind = computeIndicators([
      { status: "conforme" },
      { status: "conforme" },
      { status: "nao_conforme" },
      { status: "nao_aplicavel" },
      { status: "nao_iniciado" },
    ]);
    assert.equal(ind.conforme, 2);
    assert.equal(ind.nao_conforme, 1);
    assert.equal(ind.conformidade, 2 / 3);
  });
});
