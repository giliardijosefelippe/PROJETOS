import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WORKFLOW_LABELS, ISSUE_STATUS_LABELS } from "@/lib/types/domain";
import { StatusChip, workflowTone, issueTone } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ sem_org?: string; sem_permissao?: string }>;
}) {
  const params = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const { data: revisions } = await supabase
    .from("drawing_revisions")
    .select(
      "id, revision_code, workflow_status, drawings(number, title, projects(code, name))",
    )
    .eq("organization_id", session.organizationId)
    .neq("workflow_status", "aprovado_emissao")
    .neq("workflow_status", "cancelado")
    .order("updated_at", { ascending: false })
    .limit(8);

  const { data: issues } = await supabase
    .from("issues")
    .select("id, code, title, status, priority")
    .eq("organization_id", session.organizationId)
    .neq("status", "resolvida")
    .order("opened_at", { ascending: false })
    .limit(8);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-ink">Painel</h2>
        <p className="text-sm text-ink-muted">
          Produção e conferência de pranchas estruturais — Lunardeli Engenharia.
        </p>
      </div>

      {params.sem_org && (
        <div className="rounded-md border border-amber-200 bg-[var(--color-status-warn-bg)] p-3 text-sm">
          <span aria-hidden="true">! </span>
          Seu usuário ainda não pertence a uma organização. Execute o seed (
          <code>npm run seed</code>) ou peça ao admin para convidar.
        </div>
      )}
      {params.sem_permissao && (
        <div className="rounded-md border border-red-200 bg-[var(--color-status-danger-bg)] p-3 text-sm text-[var(--color-status-danger)]">
          <span aria-hidden="true">✕ </span>
          Sem permissão para esta ação.
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href="/projects">
          <Button>Ver projetos</Button>
        </Link>
        <Link href="/templates">
          <Button variant="secondary">Templates</Button>
        </Link>
        <Link href="/issues">
          <Button variant="secondary">Pendências</Button>
        </Link>
      </div>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Revisões em andamento</h3>
          <ul className="mt-3 divide-y divide-divider">
            {(revisions || []).map((r) => {
              const d = r.drawings as unknown as {
                number: string;
                title: string;
                projects: { code: string; name: string } | { code: string; name: string }[];
              };
              const p = Array.isArray(d?.projects) ? d.projects[0] : d?.projects;
              return (
                <li key={r.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                  <div>
                    <Link
                      href={`/revisions/${r.id}`}
                      className="font-medium text-ink hover:text-brand"
                    >
                      {p?.code} · {d?.number} · {r.revision_code}
                    </Link>
                    <p className="text-ink-muted">{d?.title}</p>
                  </div>
                  <StatusChip
                    label={WORKFLOW_LABELS[r.workflow_status as keyof typeof WORKFLOW_LABELS]}
                    tone={workflowTone(r.workflow_status)}
                  />
                </li>
              );
            })}
            {!revisions?.length && (
              <li className="py-3 text-sm text-ink-muted">Nenhuma revisão ativa.</li>
            )}
          </ul>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Pendências abertas</h3>
          <ul className="mt-3 divide-y divide-divider">
            {(issues || []).map((i) => (
              <li key={i.id} className="flex items-start justify-between gap-2 py-2 text-sm">
                <Link href={`/issues/${i.id}`} className="font-medium hover:text-brand">
                  {i.code} — {i.title}
                </Link>
                <StatusChip
                  label={ISSUE_STATUS_LABELS[i.status as keyof typeof ISSUE_STATUS_LABELS]}
                  tone={issueTone(i.status)}
                />
              </li>
            ))}
            {!issues?.length && (
              <li className="py-3 text-sm text-ink-muted">Nenhuma pendência aberta.</li>
            )}
          </ul>
        </div>
      </section>
    </div>
  );
}
