import type { ResponseStatus, WorkflowStatus } from "@/lib/types/domain";

export function canTransition(
  from: WorkflowStatus,
  to: WorkflowStatus,
): boolean {
  const map: Record<WorkflowStatus, WorkflowStatus[]> = {
    rascunho: ["em_producao", "cancelado"],
    em_producao: ["aguardando_conferencia", "cancelado"],
    aguardando_conferencia: ["em_conferencia", "em_producao", "cancelado"],
    em_conferencia: [
      "com_pendencias",
      "aprovado_emissao",
      "aguardando_reconferencia",
      "cancelado",
    ],
    com_pendencias: ["em_correcao", "cancelado"],
    em_correcao: ["aguardando_reconferencia", "cancelado"],
    aguardando_reconferencia: [
      "em_conferencia",
      "aprovado_emissao",
      "com_pendencias",
      "cancelado",
    ],
    aprovado_emissao: [],
    cancelado: [],
  };
  return map[from]?.includes(to) ?? false;
}

export function validateResponseComment(
  status: ResponseStatus,
  comment?: string | null,
): string | null {
  const c = (comment || "").trim();
  if (status === "nao_aplicavel" && !c) {
    return "Justificativa obrigatória para Não aplicável.";
  }
  if (status === "nao_conforme" && !c) {
    return "Comentário obrigatório para Não conforme.";
  }
  return null;
}

export type BlockingItem = {
  id: string;
  code: string;
  title: string;
  is_blocking: boolean;
  priority: string;
  status: ResponseStatus;
};

export function findBlockingProblems(items: BlockingItem[]) {
  return items.filter((i) => {
    const criticalOrBlocking =
      i.is_blocking || i.priority === "critica";
    if (!criticalOrBlocking) return false;
    return (
      i.status === "nao_conforme" ||
      i.status === "pendente_verificacao" ||
      i.status === "nao_iniciado"
    );
  });
}

export function computeIndicators(
  responses: { status: ResponseStatus }[],
) {
  const counts = {
    total: responses.length,
    nao_iniciado: 0,
    conforme: 0,
    nao_conforme: 0,
    nao_aplicavel: 0,
    pendente_verificacao: 0,
  };
  for (const r of responses) {
    counts[r.status] += 1;
  }
  const evaluated = counts.conforme + counts.nao_conforme;
  const applicable =
    counts.conforme +
    counts.nao_conforme +
    counts.pendente_verificacao +
    counts.nao_iniciado;
  const conformidade =
    evaluated === 0 ? null : counts.conforme / evaluated;
  const cobertura =
    applicable === 0
      ? null
      : (counts.conforme + counts.nao_conforme + counts.nao_aplicavel) /
        (applicable + counts.nao_aplicavel);
  return { ...counts, evaluated, conformidade, cobertura };
}
