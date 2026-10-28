/** Status always includes text + icon — never color alone. */

export type StatusTone = "ok" | "warn" | "danger" | "info" | "neutral";

const ICONS: Record<StatusTone, string> = {
  ok: "✓",
  warn: "!",
  danger: "✕",
  info: "i",
  neutral: "•",
};

export function StatusChip({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: StatusTone;
}) {
  return (
    <span className={`status-chip status-chip--${tone}`} title={label}>
      <span aria-hidden="true">{ICONS[tone]}</span>
      <span>{label}</span>
    </span>
  );
}

export function responseTone(status: string): StatusTone {
  switch (status) {
    case "conforme":
      return "ok";
    case "nao_conforme":
      return "danger";
    case "pendente_verificacao":
    case "nao_iniciado":
      return "warn";
    case "nao_aplicavel":
      return "neutral";
    default:
      return "neutral";
  }
}

export function workflowTone(status: string): StatusTone {
  switch (status) {
    case "aprovado_emissao":
      return "ok";
    case "com_pendencias":
    case "em_correcao":
      return "warn";
    case "cancelado":
      return "danger";
    case "em_conferencia":
    case "aguardando_conferencia":
    case "aguardando_reconferencia":
      return "info";
    default:
      return "neutral";
  }
}

export function issueTone(status: string): StatusTone {
  switch (status) {
    case "resolvida":
      return "ok";
    case "aberta":
    case "reaberta":
      return "danger";
    case "em_correcao":
    case "aguardando_reconferencia":
      return "warn";
    default:
      return "neutral";
  }
}
