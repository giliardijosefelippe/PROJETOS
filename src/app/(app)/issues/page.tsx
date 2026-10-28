import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ISSUE_STATUS_LABELS,
  PRIORITY_LABELS,
  type IssueStatus,
} from "@/lib/types/domain";
import { StatusChip, issueTone } from "@/components/ui/status-chip";
import { Label, Select, Input } from "@/components/ui/input";

export default async function IssuesPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    priority?: string;
    q?: string;
  }>;
}) {
  const session = await requireSession();
  const filters = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("issues")
    .select("id, code, title, status, priority, opened_at, projects(code)")
    .eq("organization_id", session.organizationId)
    .order("opened_at", { ascending: false })
    .limit(200);

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.priority) query = query.eq("priority", filters.priority);
  if (filters.q?.trim()) {
    query = query.or(
      `code.ilike.%${filters.q.trim()}%,title.ilike.%${filters.q.trim()}%`,
    );
  }

  const { data: issues } = await query;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Pendências</h2>
        <p className="text-sm text-ink-muted">
          Ocorrências de não conformidade e reconferência.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <div>
          <Label htmlFor="q">Busca</Label>
          <Input
            id="q"
            name="q"
            defaultValue={filters.q || ""}
            placeholder="Código ou título"
          />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={filters.status || ""}>
            <option value="">Todos</option>
            {(Object.keys(ISSUE_STATUS_LABELS) as IssueStatus[]).map((s) => (
              <option key={s} value={s}>
                {ISSUE_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="priority">Prioridade</Label>
          <Select
            id="priority"
            name="priority"
            defaultValue={filters.priority || ""}
          >
            <option value="">Todas</option>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white"
        >
          Filtrar
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-divider bg-muted text-ink-muted">
            <tr>
              <th className="px-4 py-2">Código</th>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Projeto</th>
              <th className="px-4 py-2">Prioridade</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {(issues || []).map((i) => {
              const p = i.projects as
                | { code: string }
                | { code: string }[]
                | null;
              const code = Array.isArray(p) ? p[0]?.code : p?.code;
              return (
                <tr key={i.id}>
                  <td className="px-4 py-3">
                    <Link
                      href={`/issues/${i.id}`}
                      className="font-medium text-brand"
                    >
                      {i.code}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{i.title}</td>
                  <td className="px-4 py-3">{code || "—"}</td>
                  <td className="px-4 py-3">
                    {PRIORITY_LABELS[i.priority as keyof typeof PRIORITY_LABELS]}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip
                      label={
                        ISSUE_STATUS_LABELS[
                          i.status as keyof typeof ISSUE_STATUS_LABELS
                        ]
                      }
                      tone={issueTone(i.status)}
                    />
                  </td>
                </tr>
              );
            })}
            {!issues?.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-ink-muted">
                  Nenhuma pendência com estes filtros.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
