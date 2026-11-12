/**
 * Explicit pour status workflow (Fase 4).
 * "conforme" = operational compliance of the pour record — NEVER structural approval.
 */
import type { McPourStatus } from "./types";

export const POUR_STATUS_ORDER: McPourStatus[] = [
  "planejada",
  "em_execucao",
  "aguardando_ensaios",
  "em_analise",
  "conforme",
  "nao_conforme",
  "encerrada",
];

const TRANSITIONS: Record<McPourStatus, McPourStatus[]> = {
  planejada: ["em_execucao"],
  em_execucao: ["aguardando_ensaios", "em_analise", "nao_conforme"],
  aguardando_ensaios: ["em_analise", "nao_conforme", "em_execucao"],
  em_analise: ["conforme", "nao_conforme", "aguardando_ensaios"],
  conforme: ["encerrada", "em_analise"],
  nao_conforme: ["em_execucao", "em_analise", "encerrada"],
  encerrada: ["em_analise"], // reopen only via explicit justification
};

export type PourTransitionResult =
  | { ok: true; from: McPourStatus; to: McPourStatus; requiresJustification: boolean }
  | { ok: false; code: string; message: string };

export function allowedPourTransitions(from: McPourStatus): McPourStatus[] {
  return TRANSITIONS[from] || [];
}

export function canTransitionPourStatus(
  from: McPourStatus,
  to: McPourStatus,
  justification?: string | null,
): PourTransitionResult {
  if (from === to) {
    return {
      ok: false,
      code: "SAME_STATUS",
      message: "Status de destino é igual ao atual.",
    };
  }
  const allowed = TRANSITIONS[from] || [];
  if (!allowed.includes(to)) {
    return {
      ok: false,
      code: "TRANSITION_FORBIDDEN",
      message: `Transição ${from} → ${to} não permitida. Permitidas: ${allowed.join(", ") || "nenhuma"}.`,
    };
  }

  const needsJust =
    to === "conforme" ||
    to === "nao_conforme" ||
    to === "encerrada" ||
    from === "encerrada";
  if (needsJust && !String(justification || "").trim()) {
    return {
      ok: false,
      code: "JUSTIFICATION_REQUIRED",
      message:
        "Justificativa obrigatória para este status. «Conforme» não constitui aprovação estrutural automática.",
    };
  }

  return {
    ok: true,
    from,
    to,
    requiresJustification: needsJust,
  };
}

export function structuralApprovalDisclaimer(): string {
  return (
    "Este fluxo registra status operacional da concretagem (documentos, ensaios, " +
    "quantitativos). Não emite aprovação estrutural automática com base em medida isolada."
  );
}
