import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createDeliveryAction,
  createSlumpAction,
} from "@/actions/mapas/pours";
import { transitionPourStatusAction } from "@/actions/mapas/gestao";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { SiteNav } from "@/components/mapas/site-nav";
import { compareVolumes } from "@/lib/mapas/geometry";
import { computeAccumulatedForElement } from "@/lib/mapas/quantities";
import {
  allowedPourTransitions,
  structuralApprovalDisclaimer,
} from "@/lib/mapas/pour-workflow";
import type { GeoJsonPolygon } from "@/lib/mapas/geometry";
import {
  POUR_STATUS_LABELS,
  type McElementKind,
  type McPourStatus,
} from "@/lib/mapas/types";

export default async function PourDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string; pourId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession();
  const { siteId, pourId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: pour } = await supabase
    .from("mc_concrete_pours")
    .select("*")
    .eq("id", pourId)
    .eq("site_id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!pour) notFound();

  const { data: pourRegions } = await supabase
    .from("mc_pour_regions")
    .select("region_id, mc_mapped_regions(id, name, geometry, area_m2)")
    .eq("pour_id", pourId);

  const regionRows =
    (pourRegions || [])
      .map((pr) => {
        const r = pr.mc_mapped_regions as
          | {
              id: string;
              name: string;
              geometry: GeoJsonPolygon;
              area_m2: number | null;
            }
          | {
              id: string;
              name: string;
              geometry: GeoJsonPolygon;
              area_m2: number | null;
            }[]
          | null;
        return Array.isArray(r) ? r[0] : r;
      })
      .filter(Boolean) as Array<{
      id: string;
      name: string;
      geometry: GeoJsonPolygon;
      area_m2: number | null;
    }>;

  const { data: allRegions } = await supabase
    .from("mc_mapped_regions")
    .select("id, name")
    .eq("site_id", siteId);

  const { data: pourElements } = await supabase
    .from("mc_pour_elements")
    .select(
      "element_id, executed_length_m, mc_structural_elements(id, code, name, kind, geometry, area_m2, thickness_m, height_m, volume_teorico_m3, section_area_m2, axis_length_m, executed_length_m)",
    )
    .eq("pour_id", pourId);

  const elementIds = (pourElements || []).map((pe) => pe.element_id);
  const { data: allStageLinks } = await supabase
    .from("mc_pour_elements")
    .select(
      "element_id, executed_length_m, pour_id, mc_concrete_pours!inner(id, code, site_id)",
    )
    .in(
      "element_id",
      elementIds.length
        ? elementIds
        : ["00000000-0000-0000-0000-000000000000"],
    )
    .eq("mc_concrete_pours.site_id", siteId);

  const { data: deliveries } = await supabase
    .from("mc_truck_deliveries")
    .select(
      "*, mc_delivery_region_allocations(volume_allocated_m3, region_id), mc_slump_tests(id, measured_mm, slump_spec_mm, compliant)",
    )
    .eq("pour_id", pourId)
    .order("created_at");

  const volumeNf = (deliveries || []).reduce(
    (s, d) => s + Number(d.volume_nf_m3 || 0),
    0,
  );
  const volumeAlocado = (deliveries || []).reduce((s, d) => {
    const a = d.mc_delivery_region_allocations as
      | { volume_allocated_m3: number }[]
      | null;
    return (
      s +
      (Array.isArray(a) ? a : []).reduce(
        (x, y) => x + Number(y.volume_allocated_m3 || 0),
        0,
      )
    );
  }, 0);
  const volumeReturned = (deliveries || []).reduce(
    (s, d) => s + Number(d.volume_returned_m3 || 0),
    0,
  );
  const volumeOther = (deliveries || []).reduce(
    (s, d) => s + Number(d.volume_other_dest_m3 || 0),
    0,
  );

  let volumeTeorico = 0;
  let volumeEstimado = 0;
  const accumulatedNotes: string[] = [];

  for (const pe of pourElements || []) {
    const el = pe.mc_structural_elements as
      | {
          id: string;
          code: string;
          name: string;
          kind: McElementKind;
          geometry: GeoJsonPolygon | null;
          area_m2: number | null;
          thickness_m: number | null;
          height_m: number | null;
          volume_teorico_m3: number | null;
          section_area_m2: number | null;
          axis_length_m: number | null;
          executed_length_m: number | null;
        }
      | null
      | Array<{
          id: string;
          code: string;
          name: string;
          kind: McElementKind;
          geometry: GeoJsonPolygon | null;
          area_m2: number | null;
          thickness_m: number | null;
          height_m: number | null;
          volume_teorico_m3: number | null;
          section_area_m2: number | null;
          axis_length_m: number | null;
          executed_length_m: number | null;
        }>;
    const row = Array.isArray(el) ? el[0] : el;
    if (!row) continue;
    volumeTeorico += Number(row.volume_teorico_m3 || 0);
    const beamStages =
      row.kind === "viga"
        ? (allStageLinks || [])
            .filter((s) => s.element_id === row.id)
            .map((s) => {
              const pour = s.mc_concrete_pours as
                | { id: string; code: string }
                | { id: string; code: string }[]
                | null;
              const pr = Array.isArray(pour) ? pour[0] : pour;
              return {
                pourId: s.pour_id,
                label: pr?.code,
                executedLengthM:
                  s.executed_length_m != null
                    ? Number(s.executed_length_m)
                    : null,
              };
            })
        : undefined;
    const acc = computeAccumulatedForElement(
      {
        id: row.id,
        kind: row.kind,
        geometry: row.geometry,
        area_m2: row.area_m2 != null ? Number(row.area_m2) : null,
        thickness_m: row.thickness_m != null ? Number(row.thickness_m) : null,
        height_m: row.height_m != null ? Number(row.height_m) : null,
        volume_teorico_m3:
          row.volume_teorico_m3 != null ? Number(row.volume_teorico_m3) : null,
        section_area_m2:
          row.section_area_m2 != null ? Number(row.section_area_m2) : null,
        axis_length_m:
          row.axis_length_m != null ? Number(row.axis_length_m) : null,
        executed_length_m:
          pe.executed_length_m != null
            ? Number(pe.executed_length_m)
            : row.executed_length_m != null
              ? Number(row.executed_length_m)
              : null,
      },
      regionRows.map((r) => ({
        id: r.id,
        geometry: r.geometry,
        area_m2: r.area_m2 != null ? Number(r.area_m2) : null,
      })),
      { beamStages },
    );
    if (acc) {
      if (!("indeterminate" in acc) || !acc.indeterminate) {
        volumeEstimado += acc.volumeMappedM3;
      }
      if (row.kind === "viga") {
        accumulatedNotes.push(
          `${row.code} (viga multi-etapa): ${acc.percent.toFixed(1)}% / ${acc.volumeMappedM3.toFixed(3)} m³` +
            (acc.indeterminate ? " · indeterminado" : ""),
        );
      } else {
        accumulatedNotes.push(
          `${row.code}: união ${acc.unionAreaM2.toFixed(3)} m² → ${acc.percent.toFixed(1)}% / ${acc.volumeMappedM3.toFixed(3)} m³ (sem dupla contagem)`,
        );
      }
    }
  }

  const compare = compareVolumes({
    volumeTeoricoM3: volumeTeorico,
    volumeEstimadoMapeadoM3: volumeEstimado,
    volumeNfM3: volumeNf,
    volumeAlocadoM3: volumeAlocado,
    volumeDevolvidoM3: volumeReturned,
    volumeOutrosDestinosM3: volumeOther,
  });

  const firstDeliveryId = deliveries?.[0]?.id;
  const currentStatus = pour.status as McPourStatus;
  const nextStatuses = allowedPourTransitions(currentStatus);

  const { data: statusHist } = await supabase
    .from("mc_pour_status_history")
    .select("from_status, to_status, justification, created_at")
    .eq("pour_id", pourId)
    .order("created_at", { ascending: false })
    .limit(10);

  return (
    <div className="space-y-4">
      <SiteNav siteId={siteId} current="/concretagens" />
      <div>
        <Link
          href={`/mapas/${siteId}/concretagens`}
          className="text-sm text-ink-muted hover:underline"
        >
          ← Concretagens
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold">
            {pour.code} — {pour.title}
          </h2>
          <Badge>{POUR_STATUS_LABELS[currentStatus] || pour.status}</Badge>
          {pour.is_demo && <Badge>Demonstração</Badge>}
        </div>
        <a
          className="text-sm text-[var(--color-brand)] hover:underline"
          href={`/api/mapas/report/${pourId}`}
        >
          Baixar relatório PDF
        </a>
      </div>

      {sp.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] px-3 py-2 text-sm text-[var(--color-status-danger)]">
          {sp.error}
        </p>
      )}
      {sp.ok && (
        <p className="rounded-md bg-[var(--color-status-ok-bg)] px-3 py-2 text-sm text-[var(--color-status-ok)]">
          Salvo ({sp.ok}).
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <h3 className="font-semibold">Status / aprovação operacional</h3>
        <p className="mt-1 text-xs text-ink-muted">
          {structuralApprovalDisclaimer()}
        </p>
        {nextStatuses.length > 0 ? (
          <form
            action={transitionPourStatusAction}
            className="mt-3 flex flex-wrap items-end gap-2"
          >
            <input type="hidden" name="site_id" value={siteId} />
            <input type="hidden" name="pour_id" value={pourId} />
            <div>
              <Label htmlFor="to_status">Novo status</Label>
              <Select id="to_status" name="to_status" required>
                {nextStatuses.map((s) => (
                  <option key={s} value={s}>
                    {POUR_STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div className="min-w-[12rem] flex-1">
              <Label htmlFor="justification">Justificativa</Label>
              <Input
                id="justification"
                name="justification"
                placeholder="Obrigatória para conforme / NC / encerrada"
              />
            </div>
            <Button type="submit" size="sm">
              Registrar transição
            </Button>
          </form>
        ) : (
          <p className="mt-2 text-ink-muted">Nenhuma transição disponível.</p>
        )}
        {(statusHist || []).length > 0 && (
          <ul className="mt-3 space-y-1 text-xs text-ink-muted">
            {(statusHist || []).map((h, i) => (
              <li key={i}>
                {h.from_status || "—"} → {h.to_status}: {h.justification}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-lg border border-border bg-surface p-4 text-sm">
        <h3 className="font-semibold">Comparativo (esta concretagem)</h3>
        <p className="text-xs text-ink-muted">{compare.labels.note}</p>
        <ul className="mt-2 grid gap-1 sm:grid-cols-2">
          <li>Teórico: {volumeTeorico.toFixed(3)} m³</li>
          <li>Estimado mapeado (união): {volumeEstimado.toFixed(3)} m³</li>
          <li>NFs: {volumeNf.toFixed(3)} m³</li>
          <li>Alocado: {volumeAlocado.toFixed(3)} m³</li>
          <li>
            Diferença NF − teórico: {compare.diferencaNfTeorico.toFixed(3)} m³
            (não é desperdício automático)
          </li>
          <li>Saldo carga: {compare.saldoCarga.toFixed(3)} m³</li>
        </ul>
        {accumulatedNotes.length > 0 && (
          <ul className="mt-2 text-ink-muted">
            {accumulatedNotes.map((n) => (
              <li key={n}>• {n}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <form
          action={createDeliveryAction}
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
        >
          <h3 className="font-semibold">Caminhão / NF</h3>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="pour_id" value={pourId} />
          <div>
            <Label htmlFor="nf_number">Número da NF</Label>
            <Input id="nf_number" name="nf_number" required />
          </div>
          <div>
            <Label htmlFor="plate">Placa</Label>
            <Input id="plate" name="plate" placeholder="ABC1D23" />
          </div>
          <div>
            <Label htmlFor="supplier_name">Concreteira</Label>
            <Input
              id="supplier_name"
              name="supplier_name"
              defaultValue="Concreteira Demo"
            />
          </div>
          <div>
            <Label htmlFor="volume_nf_m3">Volume NF (m³)</Label>
            <Input
              id="volume_nf_m3"
              name="volume_nf_m3"
              type="number"
              step="0.01"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="volume_returned_m3">Devolvido</Label>
              <Input
                id="volume_returned_m3"
                name="volume_returned_m3"
                type="number"
                step="0.01"
                defaultValue="0"
              />
            </div>
            <div>
              <Label htmlFor="volume_other_dest_m3">Outros destinos</Label>
              <Input
                id="volume_other_dest_m3"
                name="volume_other_dest_m3"
                type="number"
                step="0.01"
                defaultValue="0"
              />
            </div>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">
              Alocações por região (N:N)
            </legend>
            <p className="text-xs text-ink-muted">
              Uma NF pode atender várias regiões. Informe volume em cada linha;
              a soma não pode exceder NF − devolvido − outros.
            </p>
            {(allRegions || []).length === 0 && (
              <p className="text-sm text-ink-muted">Nenhuma região na obra.</p>
            )}
            {(allRegions || []).map((r) => (
              <div
                key={r.id}
                className="grid grid-cols-[1fr_7rem] items-center gap-2 text-sm"
              >
                <span>{r.name}</span>
                <Input
                  name={`alloc_volume_${r.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="m³"
                  aria-label={`Volume para ${r.name}`}
                />
              </div>
            ))}
          </fieldset>
          <Button type="submit">Registrar NF</Button>
        </form>

        <form
          action={createSlumpAction}
          encType="multipart/form-data"
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
        >
          <h3 className="font-semibold">Slump Test + foto</h3>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="pour_id" value={pourId} />
          <div>
            <Label htmlFor="delivery_id">Carga / NF</Label>
            <select
              id="delivery_id"
              name="delivery_id"
              required
              className="mt-1 w-full rounded border border-divider px-2 py-2 text-sm"
              defaultValue={firstDeliveryId || ""}
            >
              <option value="" disabled>
                Selecione
              </option>
              {(deliveries || []).map((d) => (
                <option key={d.id} value={d.id}>
                  NF {d.nf_number}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="slump_spec_mm">Espec. (mm)</Label>
              <Input
                id="slump_spec_mm"
                name="slump_spec_mm"
                type="number"
                defaultValue={String(pour.slump_spec_mm || 100)}
              />
            </div>
            <div>
              <Label htmlFor="tolerance_mm">Tolerância</Label>
              <Input
                id="tolerance_mm"
                name="tolerance_mm"
                type="number"
                defaultValue="10"
              />
            </div>
            <div>
              <Label htmlFor="measured_mm">Medido (mm)</Label>
              <Input id="measured_mm" name="measured_mm" type="number" required />
            </div>
            <div>
              <Label htmlFor="responsible_name">Responsável</Label>
              <Input id="responsible_name" name="responsible_name" />
            </div>
          </div>
          <div>
            <Label htmlFor="photo">Foto</Label>
            <Input id="photo" name="photo" type="file" accept="image/*" />
          </div>
          <Button type="submit">Registrar Slump</Button>
        </form>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Cargas registradas</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {(deliveries || []).map((d) => {
            const slumps = d.mc_slump_tests as
              | {
                  id: string;
                  measured_mm: number;
                  compliant: boolean | null;
                }[]
              | null;
            const allocs = d.mc_delivery_region_allocations as
              | { volume_allocated_m3: number; region_id: string }[]
              | null;
            return (
              <li key={d.id} className="border-b border-divider pb-2">
                <div className="font-medium">
                  NF {d.nf_number}
                  {d.plate ? ` · ${d.plate}` : ""} — {Number(d.volume_nf_m3).toFixed(2)}{" "}
                  m³
                </div>
                <div className="text-ink-muted">
                  Alocado:{" "}
                  {(Array.isArray(allocs) ? allocs : [])
                    .map((a) => `${Number(a.volume_allocated_m3).toFixed(2)} m³`)
                    .join(", ") || "—"}
                  {" · "}
                  Slump:{" "}
                  {(Array.isArray(slumps) ? slumps : [])
                    .map(
                      (s) =>
                        `${s.measured_mm} mm${s.compliant == null ? "" : s.compliant ? " OK" : " NC"}`,
                    )
                    .join(", ") || "—"}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
