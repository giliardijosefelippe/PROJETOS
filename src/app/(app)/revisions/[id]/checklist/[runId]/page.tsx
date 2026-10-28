import Link from "next/link";
import { notFound } from "next/navigation";
import {
  saveResponseAction,
  submitProductionAction,
  uploadEvidenceAction,
} from "@/actions/checklists";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  RESPONSE_LABELS,
  type ResponseStatus,
} from "@/lib/types/domain";
import { computeIndicators } from "@/lib/workflow";
import { StatusChip, responseTone } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Label, Select, TextArea } from "@/components/ui/input";
import { ChecklistNav } from "@/components/checklist/checklist-nav";

export default async function ChecklistRunPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; runId: string }>;
  searchParams: Promise<{ item?: string; error?: string; ok?: string }>;
}) {
  const { id: revisionId, runId } = await params;
  const q = await searchParams;
  await requireSession();
  const supabase = await createClient();

  const { data: run } = await supabase
    .from("checklist_runs")
    .select("*")
    .eq("id", runId)
    .eq("revision_id", revisionId)
    .maybeSingle();

  if (!run) notFound();

  const { data: items } = await supabase
    .from("checklist_run_items")
    .select(
      "*, checklist_item_responses(*, response_evidence(*))",
    )
    .eq("run_id", runId)
    .order("sort_order");

  const selectedId =
    q.item || items?.[0]?.id || "";
  const selected = items?.find((i) => i.id === selectedId) || items?.[0];

  const responses =
    items?.map((i) => {
      const resp = i.checklist_item_responses as
        | { status: ResponseStatus }
        | { status: ResponseStatus }[]
        | null;
      const r = Array.isArray(resp) ? resp[0] : resp;
      return { status: (r?.status || "nao_iniciado") as ResponseStatus };
    }) || [];
  const indicators = computeIndicators(responses);

  const response = selected
    ? (Array.isArray(selected.checklist_item_responses)
        ? selected.checklist_item_responses[0]
        : selected.checklist_item_responses)
    : null;

  const media = (selected?.media_snapshot || []) as Array<{
    kind: string;
    external_url?: string | null;
    storage_path?: string | null;
    caption?: string | null;
  }>;

  const steps = (selected?.steps || []) as string[];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/revisions/${revisionId}`}
            className="text-sm text-ink-muted hover:text-ink"
          >
            ← Voltar à revisão
          </Link>
          <h2 className="mt-1 text-xl font-semibold capitalize">
            Checklist de {run.activity_kind}
          </h2>
          <p className="text-sm text-ink-muted">
            Conformidade {indicators.conformidade != null
              ? `${(indicators.conformidade * 100).toFixed(0)}%`
              : "—"}{" "}
            · Cobertura{" "}
            {indicators.cobertura != null
              ? `${(indicators.cobertura * 100).toFixed(0)}%`
              : "—"}{" "}
            · {indicators.conforme} ✓ / {indicators.nao_conforme} ✕ /{" "}
            {indicators.pendente_verificacao + indicators.nao_iniciado} pend.
          </p>
        </div>
        {run.activity_kind === "producao" && run.status === "em_andamento" && (
          <form action={submitProductionAction}>
            <input type="hidden" name="revision_id" value={revisionId} />
            <input type="hidden" name="run_id" value={runId} />
            <Button type="submit">Encaminhar para conferência</Button>
          </form>
        )}
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
          {q.ok === "1" ? "Resposta salva" : q.ok}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_280px]">
        {/* Left: nav */}
        <aside className="rounded-lg border border-border bg-surface p-3">
          <ChecklistNav
            revisionId={revisionId}
            runId={runId}
            selectedId={selected?.id}
            items={(items || []).map((i) => {
              const resp = Array.isArray(i.checklist_item_responses)
                ? i.checklist_item_responses[0]
                : i.checklist_item_responses;
              return {
                id: i.id,
                code: i.code,
                title: i.title,
                section: i.section_title || "",
                status: (resp?.status || "nao_iniciado") as ResponseStatus,
                blocking: i.is_blocking,
              };
            })}
          />
        </aside>

        {/* Center: question */}
        <section className="rounded-lg border border-border bg-surface p-4">
          {selected ? (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase text-ink-muted">
                  {selected.section_title}
                </p>
                <h3 className="text-lg font-semibold">
                  {selected.code} — {selected.title}
                </h3>
                {selected.is_blocking && (
                  <StatusChip label="Bloqueante" tone="danger" />
                )}
              </div>

              {selected.objective && (
                <div>
                  <h4 className="text-sm font-semibold">O que verificar</h4>
                  <p className="text-sm text-ink-muted">{selected.objective}</p>
                </div>
              )}

              {steps.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold">Como executar</h4>
                  <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm text-ink-muted">
                    {steps.map((s, idx) => (
                      <li key={idx}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}

              {selected.verifiable_parameter && (
                <div>
                  <h4 className="text-sm font-semibold">Parâmetro verificável</h4>
                  <p className="text-sm">{selected.verifiable_parameter}</p>
                </div>
              )}

              {selected.acceptance_criteria && (
                <div>
                  <h4 className="text-sm font-semibold">Critério de aceitação</h4>
                  <p className="text-sm text-ink-muted">
                    {selected.acceptance_criteria}
                  </p>
                </div>
              )}

              {selected.technical_reference && (
                <div>
                  <h4 className="text-sm font-semibold">Referência técnica</h4>
                  <p className="text-sm text-ink-muted">
                    {typeof selected.technical_reference === "object"
                      ? JSON.stringify(selected.technical_reference)
                      : String(selected.technical_reference)}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Campo configurável — verificar edição vigente e
                    aplicabilidade. Não é conformidade automática.
                  </p>
                </div>
              )}

              {response && (
                <form
                  action={saveResponseAction}
                  className="space-y-3 border-t border-divider pt-4"
                >
                  <input type="hidden" name="run_id" value={runId} />
                  <input type="hidden" name="revision_id" value={revisionId} />
                  <input type="hidden" name="response_id" value={response.id} />
                  <input type="hidden" name="run_item_id" value={selected.id} />
                  <div>
                    <Label htmlFor="status">Resposta</Label>
                    <Select
                      id="status"
                      name="status"
                      defaultValue={response.status}
                      required
                    >
                      {(Object.keys(RESPONSE_LABELS) as ResponseStatus[]).map(
                        (s) => (
                          <option key={s} value={s}>
                            {RESPONSE_LABELS[s]}
                          </option>
                        ),
                      )}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="comment">
                      Observações (obrigatório em NC e N/A)
                    </Label>
                    <TextArea
                      id="comment"
                      name="comment"
                      rows={3}
                      defaultValue={response.comment || ""}
                    />
                  </div>
                  <Button type="submit">Salvar resposta</Button>
                </form>
              )}

              {response && (
                <form
                  action={uploadEvidenceAction}
                  className="space-y-2 border-t border-divider pt-4"
                  encType="multipart/form-data"
                >
                  <input type="hidden" name="response_id" value={response.id} />
                  <input type="hidden" name="revision_id" value={revisionId} />
                  <input type="hidden" name="run_id" value={runId} />
                  <input type="hidden" name="run_item_id" value={selected.id} />
                  <Label htmlFor="file">Anexar evidência</Label>
                  <input
                    id="file"
                    name="file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    className="block w-full text-sm"
                  />
                  <Button type="submit" variant="secondary" size="sm">
                    Enviar evidência
                  </Button>
                  {(response.response_evidence || []).length > 0 && (
                    <ul className="text-xs text-ink-muted">
                      {(response.response_evidence as Array<{ id: string; file_name: string }>).map(
                        (e) => (
                          <li key={e.id}>📎 {e.file_name}</li>
                        ),
                      )}
                    </ul>
                  )}
                </form>
              )}
            </div>
          ) : (
            <p className="text-ink-muted">Nenhum item neste checklist.</p>
          )}
        </section>

        {/* Right: media */}
        <aside className="rounded-lg border border-border bg-surface p-4">
          <h4 className="text-sm font-semibold">Referência visual</h4>
          <div className="mt-3 space-y-3">
            {media.map((m, idx) => (
              <div key={idx} className="text-sm">
                <p className="text-xs uppercase text-ink-muted">{m.kind}</p>
                {m.external_url ? (
                  m.kind === "video" ? (
                    <a
                      href={m.external_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand underline"
                    >
                      {m.caption || "Abrir vídeo"}
                    </a>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={m.external_url}
                      alt={m.caption || "Referência"}
                      className="mt-1 max-h-48 w-full rounded border border-border object-contain"
                    />
                  )
                ) : (
                  <p className="text-ink-muted">
                    {m.caption || "Mídia no storage (configure buckets)"}
                  </p>
                )}
                {m.caption && m.external_url && (
                  <p className="mt-1 text-xs text-ink-muted">{m.caption}</p>
                )}
              </div>
            ))}
            {!media.length && (
              <p className="text-sm text-ink-muted">
                Sem mídia neste item. Admin pode anexar na biblioteca de
                templates.
              </p>
            )}
          </div>
          {selected && (
            <div className="mt-4 border-t border-divider pt-3">
              <p className="text-xs text-ink-muted">Status atual</p>
              <StatusChip
                label={
                  RESPONSE_LABELS[
                    (response?.status || "nao_iniciado") as ResponseStatus
                  ]
                }
                tone={responseTone(response?.status || "nao_iniciado")}
              />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
