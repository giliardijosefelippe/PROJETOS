import { cn } from "@/lib/utils";

export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "ok" | "warn" | "danger" | "info";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-2 py-0.5 text-xs font-medium",
        tone === "neutral" && "bg-slate-100 text-slate-700",
        tone === "ok" && "bg-emerald-100 text-emerald-800",
        tone === "warn" && "bg-amber-100 text-amber-900",
        tone === "danger" && "bg-red-100 text-red-800",
        tone === "info" && "bg-sky-100 text-sky-900",
      )}
    >
      {children}
    </span>
  );
}

export function workflowTone(status: string) {
  switch (status) {
    case "aprovado_emissao":
      return "ok" as const;
    case "com_pendencias":
    case "em_correcao":
      return "warn" as const;
    case "cancelado":
      return "danger" as const;
    case "em_conferencia":
    case "aguardando_conferencia":
    case "aguardando_reconferencia":
      return "info" as const;
    default:
      return "neutral" as const;
  }
}
