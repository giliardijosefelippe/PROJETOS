import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createPourAction } from "@/actions/mapas/pours";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { POUR_STATUS_LABELS } from "@/lib/mapas/types";
import type { McPourStatus } from "@/lib/mapas/types";

export default async function ConcretagensPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ error?: string }>;
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

  const { data: pours } = await supabase
    .from("mc_concrete_pours")
    .select("id, code, title, status, pour_date, is_demo")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  const { data: regions } = await supabase
    .from("mc_mapped_regions")
    .select("id, name")
    .eq("site_id", siteId);

  const { data: elements } = await supabase
    .from("mc_structural_elements")
    .select("id, code, name, kind")
    .eq("site_id", siteId);

  return (
    <div className="space-y-4">
      <div>
        <Link href={`/mapas/${siteId}`} className="text-sm text-ink-muted hover:underline">
          ← {site?.code || "Obra"}
        </Link>
        <h2 className="mt-2 text-2xl font-semibold">Concretagens</h2>
        <p className="text-sm text-ink-muted">{site?.name}</p>
      </div>
      {sp.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] px-3 py-2 text-sm text-[var(--color-status-danger)]">
          {sp.error}
        </p>
      )}

      <form
        action={createPourAction}
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
      >
        <h3 className="font-semibold">Nova concretagem</h3>
        <input type="hidden" name="site_id" value={siteId} />
        <div className="grid gap-2 sm:grid-cols-2">
          <div>
            <Label htmlFor="code">Código</Label>
            <Input id="code" name="code" required placeholder="C-001" />
          </div>
          <div>
            <Label htmlFor="pour_date">Data</Label>
            <Input id="pour_date" name="pour_date" type="date" />
          </div>
          <div className="sm:col-span-2">
            <Label htmlFor="title">Título</Label>
            <Input id="title" name="title" required placeholder="1ª etapa laje" />
          </div>
          <div>
            <Label htmlFor="fck_mpa">fck (MPa)</Label>
            <Input id="fck_mpa" name="fck_mpa" type="number" defaultValue="30" />
          </div>
          <div>
            <Label htmlFor="slump_spec_mm">Slump especificado (mm)</Label>
            <Input id="slump_spec_mm" name="slump_spec_mm" type="number" defaultValue="100" />
          </div>
          <div>
            <Label htmlFor="volume_planned_m3">Volume planejado (m³)</Label>
            <Input id="volume_planned_m3" name="volume_planned_m3" type="number" step="0.01" />
          </div>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Regiões</legend>
          <div className="mt-1 flex flex-wrap gap-3 text-sm">
            {(regions || []).map((r) => (
              <label key={r.id} className="flex items-center gap-1">
                <input type="checkbox" name="region_id" value={r.id} />
                {r.name}
              </label>
            ))}
            {(regions || []).length === 0 && (
              <span className="text-ink-muted">Nenhuma região mapeada.</span>
            )}
          </div>
        </fieldset>
        <fieldset>
          <legend className="text-sm font-medium">Elementos</legend>
          <div className="mt-1 space-y-2 text-sm">
            {(elements || []).map((e) => (
              <div key={e.id} className="flex flex-wrap items-center gap-2">
                <label className="flex items-center gap-1">
                  <input type="checkbox" name="element_id" value={e.id} />
                  {e.code} {e.name}{" "}
                  <span className="text-ink-muted">[{e.kind}]</span>
                </label>
                {e.kind === "viga" && (
                  <label className="flex items-center gap-1 text-xs text-ink-muted">
                    Comp. executado nesta etapa (m)
                    <Input
                      name={`executed_length_${e.id}`}
                      type="number"
                      step="0.01"
                      className="w-24"
                      placeholder="—"
                    />
                  </label>
                )}
              </div>
            ))}
          </div>
          <p className="mt-1 text-xs text-ink-muted">
            Vigas: informe o comprimento executado por etapa (não inventado). A
            acumulação soma etapas com teto no eixo.
          </p>
        </fieldset>
        <Button type="submit">Criar concretagem</Button>
      </form>

      <ul className="divide-y divide-divider rounded-lg border border-border bg-surface">
        {(pours || []).map((p) => (
          <li key={p.id} className="flex items-center justify-between p-3 text-sm">
            <div>
              <Link
                href={`/mapas/${siteId}/concretagens/${p.id}`}
                className="font-medium hover:text-[var(--color-brand)]"
              >
                {p.code} — {p.title}
              </Link>
              <p className="text-ink-muted">
                {POUR_STATUS_LABELS[p.status as McPourStatus] || p.status}
                {p.pour_date ? ` · ${p.pour_date}` : ""}
                {p.is_demo ? " · demonstração" : ""}
              </p>
            </div>
            <Link href={`/mapas/${siteId}/concretagens/${p.id}`}>
              <Button size="sm" variant="secondary">
                Abrir
              </Button>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
