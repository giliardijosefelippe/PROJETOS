import Link from "next/link";
import {
  RESPONSE_LABELS,
  type ResponseStatus,
} from "@/lib/types/domain";
import { StatusChip, responseTone } from "@/components/ui/status-chip";
import { cn } from "@/lib/utils";

type Item = {
  id: string;
  code: string;
  title: string;
  section: string;
  status: ResponseStatus;
  blocking: boolean;
};

export function ChecklistNav({
  revisionId,
  runId,
  selectedId,
  items,
  filterStatus,
}: {
  revisionId: string;
  runId: string;
  selectedId?: string;
  items: Item[];
  filterStatus?: string;
}) {
  const filtered = filterStatus
    ? items.filter((i) => i.status === filterStatus)
    : items;

  const sections = new Map<string, Item[]>();
  for (const item of filtered) {
    const key = item.section || "Geral";
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(item);
  }

  const idx = items.findIndex((i) => i.id === selectedId);
  const prev = idx > 0 ? items[idx - 1] : null;
  const next = idx >= 0 && idx < items.length - 1 ? items[idx + 1] : null;

  return (
    <div className="space-y-3">
      <div className="flex gap-1">
        {prev ? (
          <Link
            href={`/revisions/${revisionId}/checklist/${runId}?item=${prev.id}`}
            className="flex-1 rounded-md border border-border px-2 py-1 text-center text-xs hover:bg-muted"
          >
            ← Anterior
          </Link>
        ) : (
          <span className="flex-1 rounded-md border border-transparent px-2 py-1 text-center text-xs text-ink-muted">
            ← Anterior
          </span>
        )}
        {next ? (
          <Link
            href={`/revisions/${revisionId}/checklist/${runId}?item=${next.id}`}
            className="flex-1 rounded-md border border-border px-2 py-1 text-center text-xs hover:bg-muted"
          >
            Próximo →
          </Link>
        ) : (
          <span className="flex-1 rounded-md border border-transparent px-2 py-1 text-center text-xs text-ink-muted">
            Próximo →
          </span>
        )}
      </div>

      <form className="text-xs">
        <label className="text-ink-muted" htmlFor="filter_status">
          Filtrar status
        </label>
        <select
          id="filter_status"
          name="filter"
          defaultValue={filterStatus || ""}
          className="mt-1 w-full rounded-md border border-border bg-surface px-2 py-1"
          // server nav: use links below for known filters
        >
          <option value="">Todos</option>
        </select>
        <div className="mt-1 flex flex-wrap gap-1">
          {(
            [
              ["", "Todos"],
              ["nao_iniciado", "Não iniciados"],
              ["conforme", "Conformes"],
              ["nao_conforme", "NC"],
              ["pendente_verificacao", "Pendentes"],
            ] as const
          ).map(([value, label]) => (
            <Link
              key={value || "all"}
              href={`/revisions/${revisionId}/checklist/${runId}${selectedId ? `?item=${selectedId}&` : "?"}filter=${value}`}
              className={cn(
                "rounded px-1.5 py-0.5 hover:bg-muted",
                (filterStatus || "") === value && "bg-brand-muted font-medium",
              )}
            >
              {label}
            </Link>
          ))}
        </div>
      </form>

      <nav
        className="max-h-[60vh] space-y-3 overflow-y-auto text-sm"
        aria-label="Itens"
      >
        {[...sections.entries()].map(([section, list]) => (
          <div key={section}>
            <p className="mb-1 text-xs font-semibold uppercase text-ink-muted">
              {section}
            </p>
            <ul className="space-y-1">
              {list.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/revisions/${revisionId}/checklist/${runId}?item=${item.id}${filterStatus ? `&filter=${filterStatus}` : ""}`}
                    className={cn(
                      "block rounded-md px-2 py-1.5 hover:bg-muted",
                      selectedId === item.id && "bg-brand-muted",
                    )}
                  >
                    <span className="font-medium">{item.code}</span>
                    <span className="ml-1 line-clamp-1 text-ink-muted">
                      {item.title}
                    </span>
                    <div className="mt-1">
                      <StatusChip
                        label={RESPONSE_LABELS[item.status]}
                        tone={responseTone(item.status)}
                      />
                      {item.blocking && (
                        <span className="ml-1 text-[10px] text-[var(--color-status-danger)]">
                          [bloq.]
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {!filtered.length && (
          <p className="text-xs text-ink-muted">Nenhum item neste filtro.</p>
        )}
      </nav>
    </div>
  );
}
