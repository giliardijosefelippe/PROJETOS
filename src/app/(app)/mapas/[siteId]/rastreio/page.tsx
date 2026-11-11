import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/**
 * Busca bidirecional NF → regiões e região → NFs (aceite §12.6).
 */
export default async function RastreioPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ nf?: string; plate?: string; region?: string }>;
}) {
  const session = await requireSession();
  const { siteId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("mc_sites")
    .select("code, name")
    .eq("id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  const { data: regions } = await supabase
    .from("mc_mapped_regions")
    .select("id, name")
    .eq("site_id", siteId)
    .order("name");

  let deliveriesQuery = supabase
    .from("mc_truck_deliveries")
    .select(
      "id, nf_number, plate, volume_nf_m3, pour_id, mc_delivery_region_allocations(volume_allocated_m3, region_id, mc_mapped_regions(id, name))",
    )
    .eq("site_id", siteId)
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false });

  if (sp.nf?.trim()) {
    deliveriesQuery = deliveriesQuery.ilike("nf_number", `%${sp.nf.trim()}%`);
  }
  if (sp.plate?.trim()) {
    deliveriesQuery = deliveriesQuery.ilike("plate", `%${sp.plate.trim()}%`);
  }

  const { data: deliveries } = await deliveriesQuery;

  const regionFilter = sp.region?.trim() || "";
  const filtered = (deliveries || []).filter((d) => {
    if (!regionFilter) return true;
    const allocs = d.mc_delivery_region_allocations as
      | Array<{
          region_id: string;
          mc_mapped_regions:
            | { id: string; name: string }
            | { id: string; name: string }[]
            | null;
        }>
      | null;
    const list = Array.isArray(allocs) ? allocs : [];
    return list.some((a) => a.region_id === regionFilter);
  });

  // Invert: region → NFs
  const byRegion = new Map<
    string,
    Array<{ nf: string; plate: string | null; volume: number; pourId: string | null }>
  >();
  for (const d of deliveries || []) {
    const allocs = d.mc_delivery_region_allocations as
      | Array<{
          volume_allocated_m3: number;
          region_id: string;
          mc_mapped_regions:
            | { id: string; name: string }
            | { id: string; name: string }[]
            | null;
        }>
      | null;
    for (const a of Array.isArray(allocs) ? allocs : []) {
      const key = a.region_id;
      const list = byRegion.get(key) || [];
      list.push({
        nf: d.nf_number,
        plate: d.plate,
        volume: Number(a.volume_allocated_m3),
        pourId: d.pour_id,
      });
      byRegion.set(key, list);
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/mapas/${siteId}`} className="text-sm text-ink-muted hover:underline">
          ← {site?.code || "Obra"}
        </Link>
        <h2 className="mt-2 text-2xl font-semibold">Rastreio NF ↔ regiões</h2>
        <p className="text-sm text-ink-muted">
          Pesquisa bidirecional: uma NF pode atender várias regiões; uma região
          pode receber várias NFs.
        </p>
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <div>
          <Label htmlFor="nf">NF</Label>
          <Input id="nf" name="nf" defaultValue={sp.nf || ""} placeholder="NF-…" />
        </div>
        <div>
          <Label htmlFor="plate">Placa</Label>
          <Input id="plate" name="plate" defaultValue={sp.plate || ""} />
        </div>
        <div>
          <Label htmlFor="region">Região</Label>
          <select
            id="region"
            name="region"
            defaultValue={regionFilter}
            className="mt-1 w-full rounded border border-divider px-2 py-2 text-sm"
          >
            <option value="">Todas</option>
            {(regions || []).map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">NF → regiões</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {filtered.length === 0 && (
            <li className="text-ink-muted">Nenhuma carga encontrada.</li>
          )}
          {filtered.map((d) => {
            const allocs = d.mc_delivery_region_allocations as
              | Array<{
                  volume_allocated_m3: number;
                  mc_mapped_regions:
                    | { id: string; name: string }
                    | { id: string; name: string }[]
                    | null;
                }>
              | null;
            const list = Array.isArray(allocs) ? allocs : [];
            return (
              <li key={d.id} className="border-b border-divider pb-2">
                <div className="font-medium">
                  NF {d.nf_number}
                  {d.plate ? ` · placa ${d.plate}` : ""} —{" "}
                  {Number(d.volume_nf_m3).toFixed(2)} m³
                  {d.pour_id && (
                    <>
                      {" · "}
                      <Link
                        className="text-[var(--color-brand)] hover:underline"
                        href={`/mapas/${siteId}/concretagens/${d.pour_id}`}
                      >
                        concretagem
                      </Link>
                    </>
                  )}
                </div>
                <ul className="text-ink-muted">
                  {list.length === 0 && <li>Sem alocação em região.</li>}
                  {list.map((a, i) => {
                    const reg = Array.isArray(a.mc_mapped_regions)
                      ? a.mc_mapped_regions[0]
                      : a.mc_mapped_regions;
                    return (
                      <li key={i}>
                        → {reg?.name || "região"}:{" "}
                        {Number(a.volume_allocated_m3).toFixed(2)} m³
                      </li>
                    );
                  })}
                </ul>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Região → NFs</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {(regions || []).map((r) => {
            const nfs = byRegion.get(r.id) || [];
            if (regionFilter && r.id !== regionFilter) return null;
            return (
              <li key={r.id} className="border-b border-divider pb-2">
                <div className="font-medium">{r.name}</div>
                {nfs.length === 0 ? (
                  <p className="text-ink-muted">Nenhuma NF alocada.</p>
                ) : (
                  <ul className="text-ink-muted">
                    {nfs.map((n, i) => (
                      <li key={i}>
                        ← NF {n.nf}
                        {n.plate ? ` · ${n.plate}` : ""}: {n.volume.toFixed(2)} m³
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
