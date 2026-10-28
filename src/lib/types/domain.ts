export type MembershipRole =
  | "admin"
  | "coordenador"
  | "desenhista"
  | "conferente"
  | "consulta";

export type WorkflowStatus =
  | "rascunho"
  | "em_producao"
  | "aguardando_conferencia"
  | "em_conferencia"
  | "com_pendencias"
  | "em_correcao"
  | "aguardando_reconferencia"
  | "aprovado_emissao"
  | "cancelado";

export type ActivityKind = "producao" | "conferencia";

export type ResponseStatus =
  | "nao_iniciado"
  | "conforme"
  | "nao_conforme"
  | "nao_aplicavel"
  | "pendente_verificacao";

export type IssueStatus =
  | "aberta"
  | "em_correcao"
  | "aguardando_reconferencia"
  | "resolvida"
  | "reaberta";

export type PriorityLevel = "baixa" | "media" | "alta" | "critica";

export type ReportType = "producao" | "conferencia" | "pendencias" | "resumo";

export const WORKFLOW_LABELS: Record<WorkflowStatus, string> = {
  rascunho: "Rascunho",
  em_producao: "Em produção",
  aguardando_conferencia: "Aguardando conferência",
  em_conferencia: "Em conferência",
  com_pendencias: "Com pendências",
  em_correcao: "Em correção",
  aguardando_reconferencia: "Aguardando reconferência",
  aprovado_emissao: "Aprovado para emissão",
  cancelado: "Cancelado/Arquivado",
};

export const RESPONSE_LABELS: Record<ResponseStatus, string> = {
  nao_iniciado: "Não iniciado",
  conforme: "Conforme",
  nao_conforme: "Não conforme",
  nao_aplicavel: "Não aplicável",
  pendente_verificacao: "Pendente de verificação",
};

export const ROLE_LABELS: Record<MembershipRole, string> = {
  admin: "Administrador",
  coordenador: "Coordenador",
  desenhista: "Desenhista",
  conferente: "Conferente/Revisor",
  consulta: "Consulta",
};

export const ISSUE_STATUS_LABELS: Record<IssueStatus, string> = {
  aberta: "Aberta",
  em_correcao: "Em correção",
  aguardando_reconferencia: "Aguardando reconferência",
  resolvida: "Resolvida",
  reaberta: "Reaberta",
};

export const PRIORITY_LABELS: Record<PriorityLevel, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export type SessionContext = {
  userId: string;
  email: string;
  fullName: string;
  organizationId: string;
  organizationName: string;
  role: MembershipRole;
};
