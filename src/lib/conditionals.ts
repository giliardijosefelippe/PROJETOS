import type { ResponseStatus } from "@/lib/types/domain";

/**
 * Condicionais simples (Etapa C — além do mínimo B).
 * Formato: { show_if: { item_code: "X", status_in: ["conforme", ...] } }
 */
export type ConditionalRule = {
  show_if?: {
    item_code: string;
    status_in: ResponseStatus[];
  };
  hide_if?: {
    item_code: string;
    status_in: ResponseStatus[];
  };
};

export function isItemVisible(
  rule: ConditionalRule | null | undefined,
  answersByCode: Record<string, ResponseStatus>,
): boolean {
  if (!rule) return true;
  if (rule.show_if) {
    const status = answersByCode[rule.show_if.item_code];
    if (!status || !rule.show_if.status_in.includes(status)) return false;
  }
  if (rule.hide_if) {
    const status = answersByCode[rule.hide_if.item_code];
    if (status && rule.hide_if.status_in.includes(status)) return false;
  }
  return true;
}

export function filterVisibleItems<
  T extends { code: string; conditional_rules?: ConditionalRule | null },
>(items: T[], answersByCode: Record<string, ResponseStatus>): T[] {
  return items.filter((i) => isItemVisible(i.conditional_rules, answersByCode));
}
