import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { compareVolumes } from "@/lib/mapas/geometry";
import { buildMcPourReportPdf } from "@/lib/mapas/report";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ pourId: string }> },
) {
  const session = await requireSession();
  const { pourId } = await ctx.params;
  const supabase = await createClient();

  const { data: pour } = await supabase
    .from("mc_concrete_pours")
    .select("*")
    .eq("id", pourId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!pour) {
    return NextResponse.json({ error: "Concretagem não encontrada" }, { status: 404 });
  }

  const { data: site } = await supabase
    .from("mc_sites")
    .select("code, name, is_demo")
    .eq("id", pour.site_id)
    .single();

  const { data: pourRegions } = await supabase
    .from("mc_pour_regions")
    .select("region_id, mc_mapped_regions(name, area_m2, tool)")
    .eq("pour_id", pourId);

  const { data: intersections } = await supabase
    .from("mc_region_element_intersections")
    .select(
      "percent, volume_estimado_m3, indeterminate, warnings, element_id, region_id, mc_structural_elements(code, name, kind, volume_teorico_m3)",
    )
    .in(
      "region_id",
      (pourRegions || []).map((r) => r.region_id),
    );

  const { data: deliveries } = await supabase
    .from("mc_truck_deliveries")
    .select(
      "id, nf_number, plate, volume_nf_m3, volume_returned_m3, volume_other_dest_m3, mc_delivery_region_allocations(volume_allocated_m3)",
    )
    .eq("pour_id", pourId);

  const deliveryIds = (deliveries || []).map((d) => d.id);
  const { data: slumps } = deliveryIds.length
    ? await supabase
        .from("mc_slump_tests")
        .select("delivery_id, measured_mm, slump_spec_mm, compliant")
        .in("delivery_id", deliveryIds)
    : { data: [] as Array<{
        delivery_id: string;
        measured_mm: number;
        slump_spec_mm: number | null;
        compliant: boolean | null;
      }> };

  const volumeNf = (deliveries || []).reduce(
    (s, d) => s + Number(d.volume_nf_m3 || 0),
    0,
  );
  const volumeAlocado = (deliveries || []).reduce((s, d) => {
    const allocs = d.mc_delivery_region_allocations as
      | { volume_allocated_m3: number }[]
      | null;
    const list = Array.isArray(allocs) ? allocs : allocs ? [allocs] : [];
    return s + list.reduce((a, x) => a + Number(x.volume_allocated_m3 || 0), 0);
  }, 0);
  const volumeReturned = (deliveries || []).reduce(
    (s, d) => s + Number(d.volume_returned_m3 || 0),
    0,
  );
  const volumeOther = (deliveries || []).reduce(
    (s, d) => s + Number(d.volume_other_dest_m3 || 0),
    0,
  );
  const volumeTeorico = (intersections || []).reduce((s, i) => {
    const el = i.mc_structural_elements as
      | { volume_teorico_m3: number | null }
      | { volume_teorico_m3: number | null }[]
      | null;
    const row = Array.isArray(el) ? el[0] : el;
    return s + Number(row?.volume_teorico_m3 || 0);
  }, 0);
  const volumeEstimado = (intersections || []).reduce(
    (s, i) => s + Number(i.volume_estimado_m3 || 0),
    0,
  );

  const compare = compareVolumes({
    volumeTeoricoM3: volumeTeorico,
    volumeEstimadoMapeadoM3: volumeEstimado,
    volumeNfM3: volumeNf,
    volumeAlocadoM3: volumeAlocado,
    volumeDevolvidoM3: volumeReturned,
    volumeOutrosDestinosM3: volumeOther,
  });

  const warnings: string[] = [];
  for (const i of intersections || []) {
    if (i.indeterminate) warnings.push("Há volumes indeterminados (ex.: pilares sem altura).");
    const w = i.warnings as { message?: string }[] | null;
    if (Array.isArray(w)) {
      for (const item of w) if (item.message) warnings.push(item.message);
    }
  }

  const nfById = new Map((deliveries || []).map((d) => [d.id, d.nf_number]));

  const pdf = await buildMcPourReportPdf({
    organizationName: session.organizationName,
    siteCode: site?.code || "",
    siteName: site?.name || "",
    pourCode: pour.code,
    pourTitle: pour.title,
    pourDate: pour.pour_date,
    isDemo: Boolean(site?.is_demo || pour.is_demo),
    generatedBy: session.fullName,
    generatedAt: new Date(),
    regions: (pourRegions || []).map((r) => {
      const region = r.mc_mapped_regions as
        | { name: string; area_m2: number | null; tool: string }
        | { name: string; area_m2: number | null; tool: string }[]
        | null;
      const row = Array.isArray(region) ? region[0] : region;
      return {
        name: row?.name || "Região",
        areaM2: row?.area_m2 != null ? Number(row.area_m2) : null,
        tool: row?.tool || "",
      };
    }),
    elements: (intersections || []).map((i) => {
      const el = i.mc_structural_elements as
        | {
            code: string;
            name: string;
            kind: string;
            volume_teorico_m3: number | null;
          }
        | {
            code: string;
            name: string;
            kind: string;
            volume_teorico_m3: number | null;
          }[]
        | null;
      const row = Array.isArray(el) ? el[0] : el;
      const w = i.warnings as { message?: string }[] | null;
      return {
        code: row?.code || "",
        name: row?.name || "",
        kind: row?.kind || "",
        percent: i.percent != null ? Number(i.percent) : null,
        volumeEstimadoM3:
          i.volume_estimado_m3 != null ? Number(i.volume_estimado_m3) : null,
        volumeTeoricoM3:
          row?.volume_teorico_m3 != null ? Number(row.volume_teorico_m3) : null,
        indeterminate: i.indeterminate,
        warnings: Array.isArray(w)
          ? w.map((x) => x.message || "").filter(Boolean)
          : [],
      };
    }),
    deliveries: (deliveries || []).map((d) => {
      const allocs = d.mc_delivery_region_allocations as
        | { volume_allocated_m3: number }[]
        | null;
      const list = Array.isArray(allocs) ? allocs : [];
      return {
        nf: d.nf_number,
        plate: d.plate,
        volumeNfM3: Number(d.volume_nf_m3),
        allocatedM3: list.reduce(
          (s, a) => s + Number(a.volume_allocated_m3 || 0),
          0,
        ),
      };
    }),
    slumps: (slumps || []).map((s) => ({
      nf: nfById.get(s.delivery_id) || "—",
      measuredMm: Number(s.measured_mm),
      specMm: s.slump_spec_mm != null ? Number(s.slump_spec_mm) : null,
      compliant: s.compliant,
    })),
    compare,
    warnings: [...new Set(warnings)],
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mapaconcreto-${pour.code}.pdf"`,
    },
  });
}
