import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ISSUE_STATUS_LABELS, PRIORITY_LABELS } from "@/lib/types/domain";
import { StatusChip, issueTone } from "@/components/ui/status-chip";

export default async function IssuesPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: issues } = await supabase
    .from("issues")
    .select("id, code, title, status, priority, opened_at, projects(code)")
    .eq("organization_id", session.organizationId)
    .order("opened_at", { ascending: false })
    .limit(100);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Pendências</h2>
        <p className="text-sm text-ink-muted">
          Ocorrências de não conformidade e reconferência.
        </p>
      </div>
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
                    <Link href={`/issues/${i.id}`} className="font-medium text-brand">
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
                  Nenhuma pendência registrada.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
