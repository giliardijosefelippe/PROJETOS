import type { SupabaseClient } from "@supabase/supabase-js";
import { computeSiteIndicators, type SiteIndicators } from "./indicators";
import type { McPourStatus } from "./types";

/** Load volumes + pours/deliveries/occurrences and compute indicators. */
export async function loadSiteIndicators(
  supabase: SupabaseClient,
  args: {
    organizationId: string;
    siteId: string;
    floorId?: string | null;
    periodFrom?: string | null;
    periodTo?: string | null;
  },
): Promise<SiteIndicators> {
  const { data: elements } = await supabase
    .from("mc_structural_elements")
    .select("id, volume_teorico_m3")
    .eq("site_id", args.siteId)
    .eq("organization_id", args.organizationId);

  const volumeTeorico = (elements || []).reduce(
    (s, e) => s + Number(e.volume_teorico_m3 || 0),
    0,
  );

  const { data: regions } = await supabase
    .from("mc_mapped_regions")
    .select("id")
    .eq("site_id", args.siteId)
    .is("archived_at", null);

  const regionIds = (regions || []).map((r) => r.id);
  const { data: intersections } = await supabase
    .from("mc_region_element_intersections")
    .select("volume_estimado_m3, region_id")
    .in(
      "region_id",
      regionIds.length
        ? regionIds
        : ["00000000-0000-0000-0000-000000000000"],
    );

  const volumeEstimado = (intersections || []).reduce(
    (s, i) => s + Number(i.volume_estimado_m3 || 0),
    0,
  );

  const { data: pours } = await supabase
    .from("mc_concrete_pours")
    .select("id, code, status, floor_id, pour_date, volume_planned_m3")
    .eq("site_id", args.siteId)
    .eq("organization_id", args.organizationId);

  const { data: deliveries } = await supabase
    .from("mc_truck_deliveries")
    .select(
      "pour_id, volume_nf_m3, volume_returned_m3, volume_other_dest_m3, mc_delivery_region_allocations(volume_allocated_m3), mc_slump_tests(compliant)",
    )
    .eq("site_id", args.siteId)
    .eq("organization_id", args.organizationId);

  const { data: occurrences } = await supabase
    .from("mc_site_occurrences")
    .select("id, status, severity, due_date, title")
    .eq("site_id", args.siteId)
    .eq("organization_id", args.organizationId);

  const { data: drawings } = await supabase
    .from("mc_drawing_revisions")
    .select("id, meters_per_pdf_unit, source_kind, supersedes_revision_id")
    .eq("site_id", args.siteId);

  return computeSiteIndicators({
    siteId: args.siteId,
    floorId: args.floorId,
    periodFrom: args.periodFrom,
    periodTo: args.periodTo,
    volumeTeoricoM3: volumeTeorico,
    volumeEstimadoMapeadoM3: volumeEstimado,
    pours: (pours || []).map((p) => ({
      id: p.id,
      code: p.code,
      status: p.status as McPourStatus,
      floorId: p.floor_id,
      pourDate: p.pour_date,
      volumePlannedM3:
        p.volume_planned_m3 != null ? Number(p.volume_planned_m3) : null,
    })),
    deliveries: (deliveries || []).map((d) => {
      const alloc = d.mc_delivery_region_allocations as
        | { volume_allocated_m3: number }[]
        | null;
      const slumps = d.mc_slump_tests as { compliant: boolean | null }[] | null;
      return {
        pourId: d.pour_id,
        volumeNfM3: Number(d.volume_nf_m3 || 0),
        volumeReturnedM3: Number(d.volume_returned_m3 || 0),
        volumeOtherM3: Number(d.volume_other_dest_m3 || 0),
        allocatedM3: (Array.isArray(alloc) ? alloc : []).reduce(
          (s, a) => s + Number(a.volume_allocated_m3 || 0),
          0,
        ),
        hasNonCompliantSlump: (Array.isArray(slumps) ? slumps : []).some(
          (s) => s.compliant === false,
        ),
      };
    }),
    occurrences: (occurrences || []).map((o) => ({
      id: o.id,
      status: o.status,
      severity: o.severity,
      dueDate: o.due_date,
      title: o.title,
    })),
    drawings: (drawings || []).map((d) => ({
      id: d.id,
      metersPerPdfUnit:
        d.meters_per_pdf_unit != null ? Number(d.meters_per_pdf_unit) : null,
      sourceKind: d.source_kind,
      supersedesRevisionId: d.supersedes_revision_id,
    })),
  });
}
