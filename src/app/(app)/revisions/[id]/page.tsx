import Link from "next/link";
import { notFound } from "next/navigation";
import {
  assignRevisionOwnersAction,
  updateRevisionWorkflowAction,
} from "@/actions/projects";
import { startChecklistRunAction } from "@/actions/checklists";
import {
  approveRevisionAction,
  rejectRevisionAction,
} from "@/actions/approvals";
import { returnWithPendenciasAction } from "@/actions/issues";
import {
  generateAiStubHintsAction,
  reviewAiSuggestionAction,
} from "@/actions/ai-assist";
import { requireSession, canApprove } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WORKFLOW_LABELS } from "@/lib/types/domain";
import { StatusChip, workflowTone } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, TextArea } from "@/components/ui/input";
import { ReportButtons } from "@/components/checklist/report-buttons";
import { PresenceBar } from "@/components/presence/presence-bar";

export default async function RevisionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select(
      `*,
      drawings(id, number, title, level_label, project_id, drawing_type_id, projects(id, code, name), drawing_types(name))`,
    )
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!revision) notFound();

  const drawing = revision.drawings as Record<string, unknown>;
  const project = drawing?.projects as
    | { id: string; code: string; name: string }
    | { id: string; code: string; name: string }[]
    | null;
  const projectRow = Array.isArray(project) ? project[0] : project;
  const type = drawing?.drawing_types as
    | { name: string }
    | { name: string }[]
    | null;
  const typeName = Array.isArray(type) ? type[0]?.name : type?.name;

  const { data: runs } = await supabase
    .from("checklist_runs")
    .select("id, activity_kind, status, created_at, template_snapshot")
    .eq("revision_id", id)
    .order("created_at", { ascending: false });

  const { data: templates } = await supabase
    .from("checklist_templates")
    .select("id, name, activity_kind, status")
    .eq("organization_id", session.organizationId)
    .eq("drawing_type_id", drawing?.drawing_type_id as string)
    .eq("status", "published");

  const { data: members } = await supabase
    .from("organization_memberships")
    .select("user_id, role, users_profiles(full_name, email)")
    .eq("organization_id", session.organizationId)
    .eq("status", "active");

  const { data: issues } = await supabase
    .from("issues")
    .select("id, code, title, status")
    .eq("revision_id", id)
    .order("opened_at", { ascending: false });

  const { data: aiSuggestions } = await supabase
    .from("ai_suggestions")
    .select("id, title, detail, status, confidence, source")
    .eq("revision_id", id)
    .order("created_at", { ascending: false })
    .limit(10);

  const isOwner = revision.production_owner_id === session.userId;
  const canDecide = canApprove(session.role) && !isOwner && !revision.immutable;

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/projects/${projectRow?.id}`}
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← {projectRow?.code}
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold">
              {String(drawing?.number)} · Rev. {revision.revision_code}
            </h2>
            <p className="text-sm text-ink-muted">
              {String(drawing?.title)}
              {drawing?.level_label ? ` · ${drawing.level_label}` : ""}
              {typeName ? ` · ${typeName}` : ""}
            </p>
          </div>
          <StatusChip
            label={WORKFLOW_LABELS[revision.workflow_status as keyof typeof WORKFLOW_LABELS]}
            tone={workflowTone(revision.workflow_status)}
          />
        </div>
      </div>

      {q.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] p-3 text-sm text-[var(--color-status-danger)]">
          <span aria-hidden="true">✕ </span>
          {q.error}
        </p>
      )}
      {q.ok && (
        <p className="rounded-md bg-[var(--color-status-ok-bg)] p-3 text-sm text-[var(--color-status-ok)]">
          <span aria-hidden="true">✓ </span>
          {q.ok}
        </p>
      )}

      {revision.immutable && (
        <p className="rounded-md border border-border bg-muted p-3 text-sm">
          Revisão aprovada e <strong>imutável</strong>. Alterações exigem nova
          revisão.
        </p>
      )}

      <PresenceBar revisionId={id} />

      <section className="flex flex-wrap gap-2 rounded-lg border border-border bg-surface p-3">
        <Link href={`/revisions/${id}/annotations`}>
          <Button type="button" size="sm" variant="secondary">
            Marcações PDF
          </Button>
        </Link>
        <Link
          href={`/revisions/compare?drawing_id=${drawing?.id || ""}&left=${id}`}
        >
          <Button type="button" size="sm" variant="secondary">
            Comparar revisões
          </Button>
        </Link>
        <a href={`/api/export/revision/${id}?activity=conferencia`}>
          <Button type="button" size="sm" variant="secondary">
            Exportar CSV (conferência)
          </Button>
        </a>
        <a href={`/api/export/revision/${id}?activity=producao`}>
          <Button type="button" size="sm" variant="secondary">
            Exportar CSV (produção)
          </Button>
        </a>
        <Link href="/integrations">
          <Button type="button" size="sm" variant="ghost">
            Stubs PRUMO / DWG / IA
          </Button>
        </Link>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-semibold">Sugestões de IA (revisão humana)</h3>
            <p className="text-xs text-ink-muted">
              Stub — não é interpretação estrutural automática validada. Sem
              provider externo configurado.
            </p>
          </div>
          <form action={generateAiStubHintsAction}>
            <input type="hidden" name="revision_id" value={id} />
            <Button type="submit" size="sm" variant="secondary">
              Gerar dicas stub
            </Button>
          </form>
        </div>
        <ul className="mt-3 divide-y divide-divider text-sm">
          {(aiSuggestions || []).map((s) => (
            <li key={s.id} className="space-y-2 py-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">{s.title}</p>
                  <p className="text-ink-muted">{s.detail}</p>
                  <p className="text-xs text-ink-muted">
                    fonte={s.source} · confiança={s.confidence ?? "—"} ·{" "}
                    {s.status}
                  </p>
                </div>
                {s.status === "pending_human_review" && (
                  <div className="flex gap-1">
                    {(
                      [
                        ["accepted", "Aceitar"],
                        ["rejected", "Rejeitar"],
                        ["dismissed", "Dispensar"],
                      ] as const
                    ).map(([decision, label]) => (
                      <form key={decision} action={reviewAiSuggestionAction}>
                        <input type="hidden" name="suggestion_id" value={s.id} />
                        <input type="hidden" name="revision_id" value={id} />
                        <input type="hidden" name="decision" value={decision} />
                        <Button type="submit" size="sm" variant="ghost">
                          {label}
                        </Button>
                      </form>
                    ))}
                  </div>
                )}
              </div>
            </li>
          ))}
          {!aiSuggestions?.length && (
            <li className="py-2 text-ink-muted">
              Nenhuma sugestão. Tabela `ai_suggestions` requer migration 00005.
            </li>
          )}
        </ul>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Checklists (runs)</h3>
          <ul className="mt-3 divide-y divide-divider text-sm">
            {(runs || []).map((run) => {
              const snap = run.template_snapshot as {
                template?: { name?: string; version_number?: number };
              };
              return (
                <li key={run.id} className="flex items-center justify-between py-2">
                  <div>
                    <p className="font-medium capitalize">{run.activity_kind}</p>
                    <p className="text-ink-muted">
                      {snap?.template?.name}
                      {snap?.template?.version_number != null
                        ? ` v${snap.template.version_number}`
                        : ""}{" "}
                      · {run.status}
                    </p>
                  </div>
                  <Link href={`/revisions/${id}/checklist/${run.id}`}>
                    <Button size="sm" variant="secondary">
                      Abrir
                    </Button>
                  </Link>
                </li>
              );
            })}
            {!runs?.length && (
              <li className="py-2 text-ink-muted">Nenhum checklist iniciado.</li>
            )}
          </ul>

          {!revision.immutable && (
            <div className="mt-4 space-y-3 border-t border-divider pt-4">
              <form action={startChecklistRunAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="revision_id" value={id} />
                <input type="hidden" name="activity_kind" value="producao" />
                <div className="min-w-[200px] flex-1">
                  <Label>Template produção</Label>
                  <Select name="template_id" defaultValue="">
                    <option value="">Automático (publicado)</option>
                    {(templates || [])
                      .filter((t) => t.activity_kind === "producao")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </Select>
                </div>
                <Button type="submit" size="sm">
                  Iniciar produção
                </Button>
              </form>
              <form action={startChecklistRunAction} className="flex flex-wrap items-end gap-2">
                <input type="hidden" name="revision_id" value={id} />
                <input type="hidden" name="activity_kind" value="conferencia" />
                <div className="min-w-[200px] flex-1">
                  <Label>Template conferência</Label>
                  <Select name="template_id" defaultValue="">
                    <option value="">Automático (publicado)</option>
                    {(templates || [])
                      .filter((t) => t.activity_kind === "conferencia")
                      .map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                  </Select>
                </div>
                <Button type="submit" size="sm" variant="secondary">
                  Iniciar conferência
                </Button>
              </form>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-semibold">Pendências desta revisão</h3>
            <ul className="mt-2 divide-y divide-divider text-sm">
              {(issues || []).map((i) => (
                <li key={i.id} className="py-2">
                  <Link href={`/issues/${i.id}`} className="text-brand">
                    {i.code}
                  </Link>{" "}
                  — {i.title}{" "}
                  <span className="text-ink-muted">({i.status})</span>
                </li>
              ))}
              {!issues?.length && (
                <li className="py-2 text-ink-muted">Nenhuma pendência.</li>
              )}
            </ul>
          </div>

          <div className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-semibold">Relatórios PDF</h3>
            <ReportButtons revisionId={id} />
          </div>
        </div>
      </section>

      {(session.role === "admin" || session.role === "coordenador") &&
        !revision.immutable && (
          <section className="rounded-lg border border-border bg-surface p-4">
            <h3 className="font-semibold">Responsáveis</h3>
            <form
              action={assignRevisionOwnersAction}
              className="mt-3 grid gap-3 sm:grid-cols-3"
            >
              <input type="hidden" name="revision_id" value={id} />
              <div>
                <Label>Desenhista (produção)</Label>
                <Select
                  name="production_owner_id"
                  defaultValue={revision.production_owner_id || ""}
                >
                  <option value="">—</option>
                  {(members || []).map((m) => {
                    const p = m.users_profiles as
                      | { full_name: string; email: string }
                      | { full_name: string; email: string }[]
                      | null;
                    const row = Array.isArray(p) ? p[0] : p;
                    return (
                      <option key={m.user_id} value={m.user_id}>
                        {row?.full_name || row?.email} ({m.role})
                      </option>
                    );
                  })}
                </Select>
              </div>
              <div>
                <Label>Conferente</Label>
                <Select
                  name="reviewer_id"
                  defaultValue={revision.reviewer_id || ""}
                >
                  <option value="">—</option>
                  {(members || []).map((m) => {
                    const p = m.users_profiles as
                      | { full_name: string; email: string }
                      | { full_name: string; email: string }[]
                      | null;
                    const row = Array.isArray(p) ? p[0] : p;
                    return (
                      <option key={m.user_id} value={m.user_id}>
                        {row?.full_name || row?.email} ({m.role})
                      </option>
                    );
                  })}
                </Select>
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="secondary">
                  Salvar responsáveis
                </Button>
              </div>
            </form>
          </section>
        )}

      {!revision.immutable && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Fluxo e aprovação</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {(
              [
                ["em_producao", "Em produção"],
                ["aguardando_conferencia", "Aguardando conferência"],
                ["em_conferencia", "Em conferência"],
                ["com_pendencias", "Com pendências"],
                ["em_correcao", "Em correção"],
                ["aguardando_reconferencia", "Aguardando reconferência"],
              ] as const
            ).map(([value, label]) => (
              <form key={value} action={updateRevisionWorkflowAction}>
                <input type="hidden" name="revision_id" value={id} />
                <input type="hidden" name="to_status" value={value} />
                <Button type="submit" size="sm" variant="secondary">
                  → {label}
                </Button>
              </form>
            ))}
            {canDecide && (
              <form action={returnWithPendenciasAction}>
                <input type="hidden" name="revision_id" value={id} />
                <Button type="submit" size="sm" variant="secondary">
                  Devolver com pendências
                </Button>
              </form>
            )}
          </div>

          {canDecide && (
            <div className="mt-4 grid gap-4 border-t border-divider pt-4 md:grid-cols-2">
              <form action={approveRevisionAction} className="space-y-2">
                <input type="hidden" name="revision_id" value={id} />
                <Label>Notas da aprovação</Label>
                <TextArea name="notes" rows={2} />
                <Label>Exceção formal (se houver bloqueios)</Label>
                <Input
                  name="exception_note"
                  placeholder="Não transforma NC em conformidade"
                />
                <Button type="submit">Aprovar para emissão</Button>
              </form>
              <form action={rejectRevisionAction} className="space-y-2">
                <input type="hidden" name="revision_id" value={id} />
                <Label>Motivo da reprovação</Label>
                <TextArea name="notes" rows={2} required />
                <Button type="submit" variant="danger">
                  Reprovar
                </Button>
              </form>
            </div>
          )}
          {isOwner && canApprove(session.role) && (
            <p className="mt-3 text-sm text-[var(--color-status-warn)]">
              <span aria-hidden="true">! </span>
              Você é o autor de produção desta revisão — aprovação própria
              bloqueada.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
