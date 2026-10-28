import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addIssueCommentAction,
  updateIssueStatusAction,
} from "@/actions/issues";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  ISSUE_STATUS_LABELS,
  PRIORITY_LABELS,
  type IssueStatus,
} from "@/lib/types/domain";
import { StatusChip, issueTone } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Label, TextArea } from "@/components/ui/input";
import { formatDateTime } from "@/lib/utils";

const TRANSITIONS: IssueStatus[] = [
  "aberta",
  "em_correcao",
  "aguardando_reconferencia",
  "resolvida",
  "reaberta",
];

export default async function IssueDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  await requireSession();
  const supabase = await createClient();

  const { data: issue } = await supabase
    .from("issues")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (!issue) notFound();

  const { data: events } = await supabase
    .from("issue_events")
    .select("*")
    .eq("issue_id", id)
    .order("created_at", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Link href="/issues" className="text-sm text-ink-muted hover:text-ink">
          ← Pendências
        </Link>
        <h2 className="mt-2 text-2xl font-semibold">
          {issue.code} — {issue.title}
        </h2>
        <div className="mt-2 flex flex-wrap gap-2">
          <StatusChip
            label={ISSUE_STATUS_LABELS[issue.status as IssueStatus]}
            tone={issueTone(issue.status)}
          />
          <StatusChip
            label={PRIORITY_LABELS[issue.priority as keyof typeof PRIORITY_LABELS]}
            tone="neutral"
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

      {issue.description && (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <h3 className="font-semibold">Descrição</h3>
          <p className="mt-1 text-ink-muted">{issue.description}</p>
          <p className="mt-2">
            <Link href={`/revisions/${issue.revision_id}`} className="text-brand">
              Abrir revisão
            </Link>
          </p>
        </div>
      )}

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Atualizar status</h3>
        <div className="mt-3 flex flex-wrap gap-2">
          {TRANSITIONS.map((status) => (
            <form key={status} action={updateIssueStatusAction}>
              <input type="hidden" name="issue_id" value={id} />
              <input type="hidden" name="to_status" value={status} />
              <Button type="submit" size="sm" variant="secondary">
                {ISSUE_STATUS_LABELS[status]}
              </Button>
            </form>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Comentário</h3>
        <form action={addIssueCommentAction} className="mt-3 space-y-2">
          <input type="hidden" name="issue_id" value={id} />
          <Label htmlFor="comment">Texto</Label>
          <TextArea id="comment" name="comment" rows={3} required />
          <Button type="submit" variant="secondary">
            Registrar
          </Button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Histórico</h3>
        <ul className="mt-3 space-y-3 text-sm">
          {(events || []).map((e) => (
            <li key={e.id} className="border-l-2 border-divider pl-3">
              <p className="font-medium">{e.event_type}</p>
              <p className="text-xs text-ink-muted">
                {formatDateTime(e.created_at)}
              </p>
              <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-xs text-ink-muted">
                {JSON.stringify(e.payload, null, 2)}
              </pre>
            </li>
          ))}
          {!events?.length && (
            <li className="text-ink-muted">Sem eventos ainda.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
