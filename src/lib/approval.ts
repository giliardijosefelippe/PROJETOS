import { findBlockingProblems, type BlockingItem } from "@/lib/workflow";
import { AppErrors } from "@/lib/validation/errors";
import type { IssueStatus } from "@/lib/types/domain";

export type ApprovalCheckInput = {
  actorId: string;
  productionOwnerId: string | null;
  immutable: boolean;
  items: BlockingItem[];
  openIssueStatuses: IssueStatus[];
  exceptionNote?: string | null;
};

export type ApprovalCheckResult =
  | { ok: true; exceptionRecords: Array<Record<string, unknown>> }
  | { ok: false; code: string; message: string };

/**
 * Regras de aprovação interna (testáveis sem Supabase).
 * Exceção formal NÃO transforma NC em conformidade — apenas permite seguir com registro.
 */
export function canApproveRevision(
  input: ApprovalCheckInput,
): ApprovalCheckResult {
  if (input.immutable) {
    return {
      ok: false,
      code: "IMMUTABLE_REVISION",
      message: AppErrors.IMMUTABLE_REVISION,
    };
  }
  if (
    input.productionOwnerId &&
    input.productionOwnerId === input.actorId
  ) {
    return {
      ok: false,
      code: "SELF_APPROVAL",
      message: AppErrors.SELF_APPROVAL,
    };
  }

  const blockers = findBlockingProblems(input.items);
  const openIssues = input.openIssueStatuses.filter((s) => s !== "resolvida");
  const exception = (input.exceptionNote || "").trim();

  if (blockers.length && !exception) {
    return {
      ok: false,
      code: "BLOCKING_OPEN",
      message: AppErrors.BLOCKING_OPEN,
    };
  }
  if (openIssues.length && !exception) {
    return {
      ok: false,
      code: "OPEN_ISSUES",
      message: AppErrors.OPEN_ISSUES,
    };
  }

  const exceptionRecords = exception
    ? [
        {
          note: exception,
          by: input.actorId,
          at: new Date().toISOString(),
          disclaimer:
            "Exceção formal registrada; não transforma erro técnico em conformidade.",
          blocking_codes: blockers.map((b) => b.code),
          open_issues_count: openIssues.length,
        },
      ]
    : [];

  return { ok: true, exceptionRecords };
}

export const ISSUE_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  aberta: ["em_correcao", "resolvida", "reaberta"],
  em_correcao: ["aguardando_reconferencia", "aberta", "resolvida"],
  aguardando_reconferencia: ["resolvida", "reaberta", "em_correcao"],
  resolvida: ["reaberta"],
  reaberta: ["em_correcao", "resolvida", "aberta"],
};

export function canTransitionIssue(from: IssueStatus, to: IssueStatus) {
  return ISSUE_TRANSITIONS[from]?.includes(to) ?? false;
}
