import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSiteIndicators } from "@/lib/mapas/site-metrics";
import { SiteNav } from "@/components/mapas/site-nav";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { POUR_STATUS_LABELS, type McPourStatus } from "@/lib/mapas/types";

export default async function PainelPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{
    floor_id?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const session = await requireSession();
  const { siteId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("mc_sites")
    .select("id, code, name, is_demo")
    .eq("id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!site) notFound();

  const { data: buildings } = await supabase
    .from("mc_buildings")
    .select("id, name, mc_floors(id, name)")
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

  const indicators = await loadSiteIndicators(supabase, {
    organizationId: session.organizationId,
    siteId,
    floorId: sp.floor_id || null,
    periodFrom: sp.from || null,
    periodTo: sp.to || null,
  });

  return (
    <div className="space-y-4">
      <SiteNav siteId={siteId} current="/painel" />
      <div>
        <Link href={`/mapas/${siteId}`} className="text-sm text-ink-muted hover:underline">
          ← {site.code}
        </Link>
        <h2 className="mt-1 text-2xl font-semibold">Painel de indicadores</h2>
        <p className="text-sm text-ink-muted">
          {site.name}
          {site.is_demo ? " · " : ""}
          {site.is_demo && <Badge>Demonstração</Badge>}
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <div>
          <Label htmlFor="floor_id">Pavimento</Label>
          <Select id="floor_id" name="floor_id" defaultValue={sp.floor_id || ""}>
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
          <Input id="from" name="from" type="date" defaultValue={sp.from || ""} />
        </div>
        <div>
          <Label htmlFor="to">Até</Label>
          <Input id="to" name="to" type="date" defaultValue={sp.to || ""} />
        </div>
        <Button type="submit" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[
          ["Teórico", indicators.volumeTeoricoM3],
          ["Mapeado", indicators.volumeEstimadoMapeadoM3],
          ["NF", indicators.volumeNfM3],
          ["Alocado", indicators.volumeAlocadoM3],
          ["Devolvido", indicators.volumeDevolvidoM3],
          ["Outros destinos", indicators.volumeOutrosDestinosM3],
        ].map(([label, value]) => (
          <div
            key={String(label)}
            className="rounded-lg border border-border bg-surface p-3"
          >
            <p className="text-xs text-ink-muted">{label} (m³)</p>
            <p className="text-xl font-semibold">
              {Number(value).toFixed(3)}
            </p>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <h3 className="font-semibold">Comparativo</h3>
        <p className="mt-1 text-ink-muted">
          {indicators.compare.labels.diferencaNfTeorico}
        </p>
        <p>
          NF − teórico:{" "}
          <strong>{indicators.compare.diferencaNfTeorico.toFixed(3)} m³</strong>
          {indicators.compare.desvioPercentualNfTeorico != null
            ? ` (${indicators.compare.desvioPercentualNfTeorico.toFixed(1)}%)`
            : ""}
        </p>
        <p>
          Saldo de carga:{" "}
          <strong>{indicators.compare.saldoCarga.toFixed(3)} m³</strong>
        </p>
        <p>
          Cobertura mapeado/teórico:{" "}
          <strong>
            {indicators.coverageRatio != null
              ? `${(indicators.coverageRatio * 100).toFixed(1)}%`
              : "—"}
          </strong>
        </p>
        <p className="mt-2 text-xs text-ink-muted">
          {indicators.compare.labels.note}
        </p>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Concretagens por status</h3>
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {Object.entries(indicators.poursByStatus).map(([st, n]) => (
            <li key={st}>
              <Badge>
                {POUR_STATUS_LABELS[st as McPourStatus] || st}: {n}
              </Badge>
            </li>
          ))}
          {!Object.keys(indicators.poursByStatus).length && (
            <li className="text-ink-muted">Nenhuma no filtro.</li>
          )}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">
          Pendências ({indicators.pendencias.length})
        </h3>
        <p className="text-xs text-ink-muted">
          Ocorrências abertas: {indicators.openOccurrences} · atrasadas:{" "}
          {indicators.overdueOccurrences}
        </p>
        <ul className="mt-2 space-y-2 text-sm">
          {indicators.pendencias.map((p, i) => (
            <li key={`${p.code}-${i}`}>
              <Badge>{p.severity}</Badge>{" "}
              {p.href ? (
                <Link href={p.href} className="underline">
                  {p.message}
                </Link>
              ) : (
                p.message
              )}
            </li>
          ))}
          {!indicators.pendencias.length && (
            <li className="text-ink-muted">Nenhuma pendência detectada.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
