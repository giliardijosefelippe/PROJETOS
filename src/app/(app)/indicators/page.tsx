import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { computeIndicators } from "@/lib/workflow";
import {
  WORKFLOW_LABELS,
  type ResponseStatus,
  type WorkflowStatus,
} from "@/lib/types/domain";
import { StatusChip, workflowTone } from "@/components/ui/status-chip";
import { Select, Label } from "@/components/ui/input";

function pct(n: number | null) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export default async function IndicatorsPage({
  searchParams,
}: {
  searchParams: Promise<{
    project_id?: string;
    drawing_type?: string;
    activity?: string;
  }>;
}) {
  const session = await requireSession();
  const q = await searchParams;
  const supabase = await createClient();

  const { data: projects } = await supabase
    .from("projects")
    .select("id, code, name")
    .eq("organization_id", session.organizationId)
    .eq("status", "active")
    .order("code");

  const { data: types } = await supabase
    .from("drawing_types")
    .select("id, code, name")
    .eq("organization_id", session.organizationId)
    .eq("active", true)
    .order("sort_order");

  let drawingsQuery = supabase
    .from("drawings")
    .select("id, project_id, drawing_type_id")
    .eq("organization_id", session.organizationId);

  if (q.project_id) drawingsQuery = drawingsQuery.eq("project_id", q.project_id);
  if (q.drawing_type)
    drawingsQuery = drawingsQuery.eq("drawing_type_id", q.drawing_type);

  const { data: drawings } = await drawingsQuery;
  const drawingIds = (drawings || []).map((d) => d.id);

  const { data: revisions } = drawingIds.length
    ? await supabase
        .from("drawing_revisions")
        .select("id, workflow_status, drawing_id, revision_code")
        .in("drawing_id", drawingIds)
    : { data: [] as Array<{ id: string; workflow_status: string; drawing_id: string; revision_code: string }> };

  const revisionIds = (revisions || []).map((r) => r.id);

  let runsQuery = supabase
    .from("checklist_runs")
    .select("id, activity_kind, revision_id, status")
    .eq("organization_id", session.organizationId);

  if (revisionIds.length) {
    runsQuery = runsQuery.in("revision_id", revisionIds);
  } else {
    runsQuery = runsQuery.eq("id", "00000000-0000-0000-0000-000000000000");
  }
  if (q.activity === "producao" || q.activity === "conferencia") {
    runsQuery = runsQuery.eq("activity_kind", q.activity);
  }

  const { data: runs } = await runsQuery;
  const runIds = (runs || []).map((r) => r.id);

  const { data: runItems } = runIds.length
    ? await supabase
        .from("checklist_run_items")
        .select("id, run_id, checklist_item_responses(status)")
        .in("run_id", runIds)
    : { data: [] as Array<{ id: string; run_id: string; checklist_item_responses: unknown }> };

  const responses =
    runItems?.map((i) => {
      const resp = i.checklist_item_responses as
        | { status: ResponseStatus }
        | { status: ResponseStatus }[]
        | null;
      const r = Array.isArray(resp) ? resp[0] : resp;
      return { status: (r?.status || "nao_iniciado") as ResponseStatus };
    }) || [];

  const ind = computeIndicators(responses);

  const byWorkflow = new Map<string, number>();
  for (const r of revisions || []) {
    byWorkflow.set(
      r.workflow_status,
      (byWorkflow.get(r.workflow_status) || 0) + 1,
    );
  }

  const { count: openIssues } = await supabase
    .from("issues")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", session.organizationId)
    .neq("status", "resolvida");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Indicadores</h2>
        <p className="text-sm text-ink-muted">
          Taxa de conformidade e cobertura são métricas separadas — cobertura não
          premia itens ainda não examinados.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <Label htmlFor="project_id">Projeto</Label>
          <Select
            id="project_id"
            name="project_id"
            defaultValue={q.project_id || ""}
          >
            <option value="">Todos</option>
            {(projects || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} — {p.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="drawing_type">Categoria</Label>
          <Select
            id="drawing_type"
            name="drawing_type"
            defaultValue={q.drawing_type || ""}
          >
            <option value="">Todas</option>
            {(types || []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="activity">Atividade</Label>
          <Select id="activity" name="activity" defaultValue={q.activity || ""}>
            <option value="">Produção + conferência</option>
            <option value="producao">Produção</option>
            <option value="conferencia">Conferência</option>
          </Select>
        </div>
        <button
          type="submit"
          className="rounded-md bg-[var(--color-brand)] px-3 py-2 text-sm font-medium text-white hover:bg-[var(--color-brand-hover)]"
        >
          Filtrar
        </button>
      </form>

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          title="Conformidade"
          value={pct(ind.conformidade)}
          hint="conformes ÷ (conformes + não conformes)"
        />
        <Metric
          title="Cobertura"
          value={pct(ind.cobertura)}
          hint="avaliados aplicáveis ÷ total aplicável+N/A"
        />
        <Metric title="Itens avaliados" value={String(ind.evaluated)} hint={`de ${ind.total} no filtro`} />
        <Metric
          title="Pendências abertas"
          value={String(openIssues || 0)}
          hint="status ≠ resolvida"
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Distribuição de respostas</h3>
          <ul className="mt-3 space-y-2 text-sm">
            <li>✓ Conformes: {ind.conforme}</li>
            <li>✕ Não conformes: {ind.nao_conforme}</li>
            <li>• Não aplicáveis: {ind.nao_aplicavel}</li>
            <li>! Pendentes de verificação: {ind.pendente_verificacao}</li>
            <li>• Não iniciados: {ind.nao_iniciado}</li>
          </ul>
        </div>
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Revisões por status</h3>
          <ul className="mt-3 space-y-2 text-sm">
            {[...byWorkflow.entries()].map(([status, count]) => (
              <li key={status} className="flex items-center justify-between gap-2">
                <StatusChip
                  label={
                    WORKFLOW_LABELS[status as WorkflowStatus] || status
                  }
                  tone={workflowTone(status)}
                />
                <span>{count}</span>
              </li>
            ))}
            {!byWorkflow.size && (
              <li className="text-ink-muted">Nenhuma revisão no filtro.</li>
            )}
          </ul>
        </div>
      </section>

      <p className="text-sm text-ink-muted">
        Detalhe por revisão:{" "}
        <Link href="/projects" className="text-brand">
          Projetos
        </Link>{" "}
        ·{" "}
        <Link href="/reports" className="text-brand">
          Relatórios PDF
        </Link>
      </p>
    </div>
  );
}

function Metric({
  title,
  value,
  hint,
}: {
  title: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
        {title}
      </p>
      <p className="mt-1 text-2xl font-semibold text-ink">{value}</p>
      <p className="mt-1 text-xs text-ink-muted">{hint}</p>
    </div>
  );
}
