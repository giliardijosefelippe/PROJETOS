import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
} from "@/actions/mapas/gestao";
import { SiteNav } from "@/components/mapas/site-nav";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function NotificacoesPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ ok?: string }>;
}) {
  const session = await requireSession();
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

  const { data: notifications } = await supabase
    .from("mc_notifications")
    .select("id, kind, title, body, href, read_at, created_at")
    .eq("user_id", session.userId)
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(50);

  const unread = (notifications || []).filter((n) => !n.read_at).length;

  return (
    <div className="space-y-4">
      <SiteNav siteId={siteId} current="/notificacoes" />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/mapas/${siteId}`}
            className="text-sm text-ink-muted hover:underline"
          >
            ← {site.code}
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">Avisos in-app</h2>
          <p className="text-sm text-ink-muted">
            Pendências e mudanças de status · sem e-mail/push pago · {unread}{" "}
            não lido(s)
          </p>
        </div>
        <form action={markAllNotificationsReadAction}>
          <input type="hidden" name="site_id" value={siteId} />
          <Button type="submit" size="sm" variant="secondary">
            Marcar todas como lidas
          </Button>
        </form>
      </div>

      {sp.ok && (
        <p className="text-sm text-[var(--color-status-ok)]">Atualizado.</p>
      )}

      <ul className="space-y-2">
        {(notifications || []).map((n) => (
          <li
            key={n.id}
            className="rounded-lg border border-border bg-surface p-3 text-sm"
          >
            <div className="flex flex-wrap items-center gap-2">
              <Badge>{n.kind}</Badge>
              {!n.read_at && <Badge>novo</Badge>}
              <span className="font-medium">{n.title}</span>
            </div>
            {n.body && <p className="mt-1 text-ink-muted">{n.body}</p>}
            <p className="text-xs text-ink-muted">
              {new Date(n.created_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {n.href && (
                <Link href={n.href}>
                  <Button size="sm" variant="secondary">
                    Abrir
                  </Button>
                </Link>
              )}
              {!n.read_at && (
                <form action={markNotificationReadAction}>
                  <input type="hidden" name="site_id" value={siteId} />
                  <input type="hidden" name="notification_id" value={n.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Marcar lida
                  </Button>
                </form>
              )}
            </div>
          </li>
        ))}
        {(notifications || []).length === 0 && (
          <li className="text-sm text-ink-muted">Nenhum aviso nesta obra.</li>
        )}
      </ul>
    </div>
  );
}
