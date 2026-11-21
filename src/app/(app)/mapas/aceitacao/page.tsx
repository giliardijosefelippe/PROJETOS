import Link from "next/link";
import { requireSession } from "@/lib/auth";
import {
  ACCEPTANCE_CHECKLIST,
  acceptanceSummary,
} from "@/lib/mapas/acceptance";
import { Badge } from "@/components/ui/badge";

const STATUS_LABEL = {
  covered: { label: "Coberto no código", tone: "ok" as const },
  partial: { label: "Parcial", tone: "warn" as const },
  env_dependent: { label: "Depende do ambiente", tone: "info" as const },
};

export default async function AceitacaoPage() {
  await requireSession();
  const summary = acceptanceSummary();

  return (
    <div className="space-y-4">
      <div>
        <Link href="/mapas" className="text-sm text-ink-muted hover:underline">
          ← MapaConcreto
        </Link>
        <h2 className="mt-1 text-2xl font-semibold">
          Critérios de aceite (§12)
        </h2>
        <p className="text-sm text-ink-muted">
          Checklist da especificação vs. implementação atual.{" "}
          <strong>
            {summary.covered}/{summary.total}
          </strong>{" "}
          cobertos · {summary.partial} parciais. Sem inventar volumes.
        </p>
      </div>

      <ul className="space-y-3">
        {ACCEPTANCE_CHECKLIST.map((item) => (
          <li
            key={item.id}
            className="rounded-lg border border-border bg-surface p-4 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="info">{item.id}</Badge>
              <Badge tone={STATUS_LABEL[item.status].tone}>
                {STATUS_LABEL[item.status].label}
              </Badge>
            </div>
            <p className="mt-2 font-medium">{item.criterion}</p>
            <p className="mt-1 text-xs text-ink-muted">
              Evidência: {item.evidence}
            </p>
            {item.gap && (
              <p className="mt-1 text-xs text-[var(--color-status-warn)]">
                Lacuna: {item.gap}
              </p>
            )}
          </li>
        ))}
      </ul>

      <p className="text-xs text-ink-muted">
        Validação local:{" "}
        <code>npm run test && npm run typecheck && npm run lint</code> · seed:{" "}
        <code>npm run seed && npm run seed:mapas</code> · migrations 00007–00013.
        DWG real exige ODA + <code>CAD_CONVERT_URL</code> no ambiente.
      </p>
    </div>
  );
}