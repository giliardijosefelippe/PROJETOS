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
}: {
  revisionId: string;
  runId: string;
  selectedId?: string;
  items: Item[];
}) {
  const sections = new Map<string, Item[]>();
  for (const item of items) {
    const key = item.section || "Geral";
    if (!sections.has(key)) sections.set(key, []);
    sections.get(key)!.push(item);
  }

  return (
    <nav className="max-h-[70vh] space-y-3 overflow-y-auto text-sm" aria-label="Itens">
      {[...sections.entries()].map(([section, list]) => (
        <div key={section}>
          <p className="mb-1 text-xs font-semibold uppercase text-ink-muted">
            {section}
          </p>
          <ul className="space-y-1">
            {list.map((item) => (
              <li key={item.id}>
                <Link
                  href={`/revisions/${revisionId}/checklist/${runId}?item=${item.id}`}
                  className={cn(
                    "block rounded-md px-2 py-1.5 hover:bg-muted",
                    selectedId === item.id && "bg-brand-muted",
                  )}
                >
                  <span className="font-medium">{item.code}</span>
                  <span className="ml-1 text-ink-muted line-clamp-1">
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
    </nav>
  );
}
