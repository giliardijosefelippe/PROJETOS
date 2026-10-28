import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  compareRevisionResponses,
  summarizeDiff,
} from "@/lib/revision-compare";
import {
  RESPONSE_LABELS,
  WORKFLOW_LABELS,
  type ResponseStatus,
  type WorkflowStatus,
} from "@/lib/types/domain";
import { StatusChip, responseTone, workflowTone } from "@/components/ui/status-chip";
import { Label, Select } from "@/components/ui/input";

async function loadResponses(
  supabase: Awaited<ReturnType<typeof createClient>>,
  revisionId: string,
  activity: string,
) {
  const { data: runs } = await supabase
    .from("checklist_runs")
    .select("id")
    .eq("revision_id", revisionId)
    .eq("activity_kind", activity)
    .order("created_at", { ascending: false })
    .limit(1);
  const run = runs?.[0];
  if (!run) return [];
  const { data: items } = await supabase
    .from("checklist_run_items")
    .select("code, title, checklist_item_responses(status, comment)")
    .eq("run_id", run.id)
    .order("sort_order");
  return (
    items?.map((i) => {
      const resp = i.checklist_item_responses as
        | { status: ResponseStatus; comment: string | null }
        | { status: ResponseStatus; comment: string | null }[]
        | null;
      const r = Array.isArray(resp) ? resp[0] : resp;
      return {
        code: i.code,
        title: i.title,
        status: (r?.status || "nao_iniciado") as ResponseStatus,
        comment: r?.comment,
      };
    }) || []
  );
}

export default async function CompareRevisionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    left?: string;
    right?: string;
    activity?: string;
    drawing_id?: string;
  }>;
}) {
  const session = await requireSession();
  const q = await searchParams;
  const activity = q.activity === "producao" ? "producao" : "conferencia";
  const supabase = await createClient();

  const { data: drawings } = await supabase
    .from("drawings")
    .select("id, number, title, projects(code)")
    .eq("organization_id", session.organizationId)
    .order("number")
    .limit(100);

  let revisionsQuery = supabase
    .from("drawing_revisions")
    .select("id, revision_code, workflow_status, drawing_id, immutable")
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (q.drawing_id) {
    revisionsQuery = revisionsQuery.eq("drawing_id", q.drawing_id);
  }

  const { data: revisions } = await revisionsQuery;

  const leftId = q.left || "";
  const rightId = q.right || "";
  const leftMeta = (revisions || []).find((r) => r.id === leftId);
  const rightMeta = (revisions || []).find((r) => r.id === rightId);

  const leftRows =
    leftId ? await loadResponses(supabase, leftId, activity) : [];
  const rightRows =
    rightId ? await loadResponses(supabase, rightId, activity) : [];

  const diff =
    leftId && rightId
      ? compareRevisionResponses(leftRows, rightRows)
      : [];
  const summary = summarizeDiff(diff);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Comparar revisões</h2>
        <p className="text-sm text-ink-muted">
          Diferenças de respostas entre duas revisões da mesma prancha (ou
          selecionadas). Não substitui comparação gráfica CAD.
        </p>
      </div>

      <form className="grid gap-3 rounded-lg border border-border bg-surface p-4 md:grid-cols-4">
        <div>
          <Label>Prancha (filtro)</Label>
          <Select name="drawing_id" defaultValue={q.drawing_id || ""}>
            <option value="">Todas</option>
            {(drawings || []).map((d) => {
              const p = d.projects as
                | { code: string }
                | { code: string }[]
                | null;
              const code = Array.isArray(p) ? p[0]?.code : p?.code;
              return (
                <option key={d.id} value={d.id}>
                  {code} · {d.number} — {d.title}
                </option>
              );
            })}
          </Select>
        </div>
        <div>
          <Label>Revisão A (esquerda)</Label>
          <Select name="left" defaultValue={leftId} required>
            <option value="">Selecione…</option>
            {(revisions || []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.revision_code} ({r.workflow_status})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Revisão B (direita)</Label>
          <Select name="right" defaultValue={rightId} required>
            <option value="">Selecione…</option>
            {(revisions || []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.revision_code} ({r.workflow_status})
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Atividade</Label>
          <Select name="activity" defaultValue={activity}>
            <option value="conferencia">Conferência</option>
            <option value="producao">Produção</option>
          </Select>
        </div>
        <div className="md:col-span-4">
          <button
            type="submit"
            className="rounded-md bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white"
          >
            Comparar
          </button>
        </div>
      </form>

      {leftMeta && rightMeta && (
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="rounded-md border border-border bg-surface px-3 py-2">
            A: <strong>{leftMeta.revision_code}</strong>{" "}
            <StatusChip
              label={
                WORKFLOW_LABELS[
                  leftMeta.workflow_status as WorkflowStatus
                ] || leftMeta.workflow_status
              }
              tone={workflowTone(leftMeta.workflow_status)}
            />
          </div>
          <div className="rounded-md border border-border bg-surface px-3 py-2">
            B: <strong>{rightMeta.revision_code}</strong>{" "}
            <StatusChip
              label={
                WORKFLOW_LABELS[
                  rightMeta.workflow_status as WorkflowStatus
                ] || rightMeta.workflow_status
              }
              tone={workflowTone(rightMeta.workflow_status)}
            />
          </div>
          <p className="text-ink-muted">
            +{summary.added} / −{summary.removed} / ~status{" "}
            {summary.status_changed} / = {summary.unchanged}
          </p>
        </div>
      )}

      {diff.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-divider bg-muted text-ink-muted">
              <tr>
                <th className="px-3 py-2">Código</th>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">A</th>
                <th className="px-3 py-2">B</th>
                <th className="px-3 py-2">Δ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {diff
                .filter((d) => d.change !== "unchanged")
                .concat(diff.filter((d) => d.change === "unchanged").slice(0, 20))
                .map((d) => (
                  <tr key={d.code}>
                    <td className="px-3 py-2 font-medium">{d.code}</td>
                    <td className="px-3 py-2">{d.title}</td>
                    <td className="px-3 py-2">
                      {d.leftStatus ? (
                        <StatusChip
                          label={
                            RESPONSE_LABELS[
                              d.leftStatus as ResponseStatus
                            ] || d.leftStatus
                          }
                          tone={responseTone(d.leftStatus)}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {d.rightStatus ? (
                        <StatusChip
                          label={
                            RESPONSE_LABELS[
                              d.rightStatus as ResponseStatus
                            ] || d.rightStatus
                          }
                          tone={responseTone(d.rightStatus)}
                        />
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">{d.change}</td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="border-t border-divider px-3 py-2 text-xs text-ink-muted">
            Itens inalterados limitados a 20 na lista.{" "}
            {leftId && (
              <Link
                href={`/revisions/${leftId}`}
                className="text-brand"
              >
                Abrir A
              </Link>
            )}{" "}
            ·{" "}
            {rightId && (
              <Link href={`/revisions/${rightId}`} className="text-brand">
                Abrir B
              </Link>
            )}
          </p>
        </div>
      )}

      {leftId && rightId && !diff.length && (
        <p className="text-sm text-ink-muted">
          Sem respostas para comparar (inicie checklists nas revisões).
        </p>
      )}
    </div>
  );
}
