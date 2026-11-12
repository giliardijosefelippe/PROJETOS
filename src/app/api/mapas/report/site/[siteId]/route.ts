import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSiteIndicators } from "@/lib/mapas/site-metrics";
import { buildMcConsolidatedReportPdf } from "@/lib/mapas/report";

export async function GET(
  req: Request,
  ctx: { params: Promise<{ siteId: string }> },
) {
  const session = await requireSession();
  const { siteId } = await ctx.params;
  const url = new URL(req.url);
  const floorId = url.searchParams.get("floor_id") || null;
  const from = url.searchParams.get("from") || null;
  const to = url.searchParams.get("to") || null;

  const supabase = await createClient();
  const { data: site } = await supabase
    .from("mc_sites")
    .select("code, name, is_demo")
    .eq("id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!site) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
  }

  let floorLabel: string | null = null;
  if (floorId) {
    const { data: floor } = await supabase
      .from("mc_floors")
      .select("name, mc_buildings(name)")
      .eq("id", floorId)
      .maybeSingle();
    const b = floor?.mc_buildings as
      | { name: string }
      | { name: string }[]
      | null;
    const bn = Array.isArray(b) ? b[0]?.name : b?.name;
    floorLabel = floor ? `${bn || ""} / ${floor.name}` : floorId;
  }

  const indicators = await loadSiteIndicators(supabase, {
    organizationId: session.organizationId,
    siteId,
    floorId,
    periodFrom: from,
    periodTo: to,
  });

  let poursQuery = supabase
    .from("mc_concrete_pours")
    .select("code, title, status, pour_date, floor_id")
    .eq("site_id", siteId)
    .eq("organization_id", session.organizationId);
  if (floorId) poursQuery = poursQuery.eq("floor_id", floorId);
  const { data: pours } = await poursQuery;

  const filtered = (pours || []).filter((p) => {
    if (!from && !to) return true;
    if (!p.pour_date) return false;
    if (from && p.pour_date < from) return false;
    if (to && p.pour_date > to) return false;
    return true;
  });

  const pdf = await buildMcConsolidatedReportPdf({
    organizationName: session.organizationName,
    siteCode: site.code,
    siteName: site.name,
    floorLabel,
    periodFrom: from,
    periodTo: to,
    isDemo: site.is_demo,
    generatedBy: session.fullName || session.email,
    generatedAt: new Date(),
    indicators,
    pours: filtered.map((p) => ({
      code: p.code,
      title: p.title,
      status: p.status,
      pourDate: p.pour_date,
    })),
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="mapaconcreto-${site.code}-consolidado.pdf"`,
    },
  });
}
