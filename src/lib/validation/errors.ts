/** Mensagens de erro consistentes (pt-BR) — Etapa C */

export const AppErrors = {
  UNAUTHENTICATED: "Faça login para continuar.",
  FORBIDDEN: "Você não tem permissão para esta ação.",
  NO_ORG: "Seu usuário ainda não pertence a uma organização ativa.",
  NOT_FOUND: "Registro não encontrado ou inacessível nesta organização.",
  IMMUTABLE_REVISION:
    "Revisão aprovada é imutável. Crie uma nova revisão para alterações.",
  IMMUTABLE_TEMPLATE:
    "Versão publicada do template não pode ser editada. Crie uma nova versão.",
  SELF_APPROVAL:
    "Não é permitido aprovar a própria prancha (autor de produção da revisão).",
  BLOCKING_OPEN:
    "Há itens críticos/bloqueantes pendentes. Resolva-os ou registre exceção formal.",
  OPEN_ISSUES:
    "Há pendências abertas. Resolva-as ou registre exceção formal.",
  INVALID_TRANSITION: "Transição de status não permitida neste fluxo.",
  NA_REQUIRES_JUSTIFICATION:
    "Justificativa obrigatória para Não aplicável.",
  NC_REQUIRES_COMMENT: "Comentário obrigatório para Não conforme.",
  VALIDATION: "Dados inválidos. Verifique os campos e tente novamente.",
} as const;

export type AppErrorCode = keyof typeof AppErrors;

export function appError(code: AppErrorCode, detail?: string) {
  const base = AppErrors[code];
  return detail ? `${base} ${detail}` : base;
}

export function redirectWithError(path: string, message: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}error=${encodeURIComponent(message)}`;
}

export function redirectWithOk(path: string, message: string) {
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}ok=${encodeURIComponent(message)}`;
}
