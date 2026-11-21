import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { SiteNav } from "@/components/mapas/site-nav";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default async function RelatoriosPage({
  params,
}: {
  params: Promise<{ siteId: string }>;
}) {
  const session = await requireSession();
  const { siteId } = await params;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("mc_sites")
    .select("id, code, name")
    .eq("id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!site) notFound();

  const { data: buildings } = await supabase
    .from("mc_buildings")
    .select("name, mc_floors(id, name)")
    .eq("site_id", siteId);

  const floors =
    buildings?.flatMap((b) => {
      const fl = b.mc_floors as
        | { id: string; name: string }[]
        | { id: string; name: string }
        | null;
      const list = Array.isArray(fl) ? fl : fl ? [fl] : [];
      return list.map((f) => ({ ...f, building: b.name }));
    }) || [];

  const { data: pours } = await supabase
    .from("mc_concrete_pours")
    .select("id, code, title")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(30);

  return (
    <div className="space-y-4">
      <SiteNav siteId={siteId} current="/relatorios" />
      <div>
        <Link
          href={`/mapas/${siteId}`}
          className="text-sm text-ink-muted hover:underline"
        >
          ← {site.code}
        </Link>
        <h2 className="mt-1 text-2xl font-semibold">Relatórios</h2>
        <p className="text-sm text-ink-muted">
          Consolidado por obra/pavimento/período (PDF/CSV) e relatório por
          concretagem.
        </p>
      </div>

      <form
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
        method="get"
        action={`/api/mapas/report/site/${siteId}`}
      >
        <h3 className="font-semibold">Consolidado da obra</h3>
        <div className="grid gap-2 sm:grid-cols-3">
          <div>
            <Label htmlFor="floor_id">Pavimento</Label>
            <Select id="floor_id" name="floor_id" defaultValue="">
              <option value="">Todos</option>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.building} / {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="from">De</Label>
            <Input id="from" name="from" type="date" />
          </div>
          <div>
            <Label htmlFor="to">Até</Label>
            <Input id="to" name="to" type="date" />
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" name="format" value="pdf">
            Baixar PDF
          </Button>
          <Button
            type="submit"
            name="format"
            value="csv"
            variant="secondary"
            formAction={`/api/mapas/export/site/${siteId}`}
          >
            Baixar CSV
          </Button>
        </div>
      </form>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Por concretagem</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {(pours || []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <span className="font-medium">
                {p.code} — {p.title}
              </span>
              <a
                className="text-[var(--color-brand)] underline"
                href={`/api/mapas/report/${p.id}`}
              >
                PDF
              </a>
              <Link
                href={`/mapas/${siteId}/concretagens/${p.id}`}
                className="text-ink-muted underline"
              >
                ficha
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
