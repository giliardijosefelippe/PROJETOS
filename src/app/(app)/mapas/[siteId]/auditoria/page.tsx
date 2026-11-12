import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteNav } from "@/components/mapas/site-nav";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const MC_ACTIONS_PREFIX = "mc.";

export default async function AuditoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ q?: string; action?: string }>;
}) {
  const session = await requireSession(["admin", "coordenador", "conferente"]);
  const { siteId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("mc_sites")
    .select("id, code, name")
    .eq("id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!site) notFound();

  let query = supabase
    .from("audit_events")
    .select("id, actor_id, action, entity_type, entity_id, payload, created_at")
    .eq("organization_id", session.organizationId)
    .like("action", `${MC_ACTIONS_PREFIX}%`)
    .order("created_at", { ascending: false })
    .limit(100);

  if (sp.action) {
    query = query.eq("action", sp.action);
  }

  const { data: events } = await query;

  const filtered = (events || []).filter((e) => {
    if (!sp.q) return true;
    const blob = JSON.stringify(e.payload || {}).toLowerCase();
    return (
      e.action.toLowerCase().includes(sp.q.toLowerCase()) ||
      blob.includes(sp.q.toLowerCase()) ||
      (e.entity_id || "").includes(sp.q)
    );
  });

  const { data: statusHist } = await supabase
    .from("mc_pour_status_history")
    .select(
      "id, pour_id, from_status, to_status, justification, structural_approval_claimed, decided_by, created_at, mc_concrete_pours!inner(site_id, code)",
    )
    .eq("organization_id", session.organizationId)
    .eq("mc_concrete_pours.site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-4">
      <SiteNav siteId={siteId} current="/auditoria" />
      <div>
        <Link
          href={`/mapas/${siteId}`}
          className="text-sm text-ink-muted hover:underline"
        >
          ← {site.code}
        </Link>
        <h2 className="mt-1 text-2xl font-semibold">Auditoria</h2>
        <p className="text-sm text-ink-muted">
          Quem / quando / antes-depois das operações críticas MapaConcreto.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="q">Busca</Label>
          <Input id="q" name="q" defaultValue={sp.q || ""} placeholder="ação, id…" />
        </div>
        <div>
          <Label htmlFor="action">Ação</Label>
          <Input
            id="action"
            name="action"
            defaultValue={sp.action || ""}
            placeholder="mc.pour.status"
          />
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Histórico de status (concretagens)</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {(statusHist || []).map((h) => {
            const pour = h.mc_concrete_pours as
              | { site_id: string; code: string }
              | { site_id: string; code: string }[]
              | null;
            const row = Array.isArray(pour) ? pour[0] : pour;
            return (
              <li key={h.id} className="border-b border-divider pb-2">
                <Badge>
                  {h.from_status || "—"} → {h.to_status}
                </Badge>{" "}
                {row?.code && (
                  <Link
                    className="underline"
                    href={`/mapas/${siteId}/concretagens/${h.pour_id}`}
                  >
                    {row.code}
                  </Link>
                )}
                <p className="text-ink-muted">{h.justification}</p>
                <p className="text-xs text-ink-muted">
                  {new Date(h.created_at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}
                  {h.structural_approval_claimed
                    ? " · ⚠ claimed structural (não deveria)"
                    : " · sem aprovação estrutural"}
                </p>
              </li>
            );
          })}
          {(statusHist || []).length === 0 && (
            <li className="text-ink-muted">Nenhuma transição registrada.</li>
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Eventos audit_events (mc.*)</h3>
        <ul className="mt-2 space-y-3 text-sm">
          {filtered.map((e) => {
            const payload = (e.payload || {}) as {
              before?: unknown;
              after?: unknown;
              note?: string;
              justification?: string;
            };
            return (
              <li key={e.id} className="border-b border-divider pb-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge>{e.action}</Badge>
                  <span className="text-xs text-ink-muted">
                    {e.entity_type} {e.entity_id?.slice(0, 8)}…
                  </span>
                </div>
                <p className="text-xs text-ink-muted">
                  {new Date(e.created_at).toLocaleString("pt-BR", {
                    timeZone: "America/Sao_Paulo",
                  })}{" "}
                  · actor {e.actor_id?.slice(0, 8) || "—"}…
                </p>
                {(payload.before != null || payload.after != null) && (
                  <pre className="mt-1 overflow-x-auto rounded bg-[var(--color-muted)] p-2 text-xs">
                    {JSON.stringify(
                      { before: payload.before, after: payload.after },
                      null,
                      2,
                    )}
                  </pre>
                )}
                {payload.justification && (
                  <p className="text-ink-muted">Justificativa: {payload.justification}</p>
                )}
                {payload.note && (
                  <p className="text-ink-muted">{payload.note}</p>
                )}
              </li>
            );
          })}
          {!filtered.length && (
            <li className="text-ink-muted">Nenhum evento encontrado.</li>
          )}
        </ul>
      </section>

      <section className="text-xs text-ink-muted space-y-1">
        <p className="font-medium text-ink">Lacunas conhecidas</p>
        <p>• Edição geométrica detalhada de região ainda não gera before/after completo.</p>
        <p>• Eventos antigos (pré-Fase 4) podem não ter campos before/after.</p>
        <p>• Sem exclusão física de auditoria / runs aprovados.</p>
      </section>
    </div>
  );
}
