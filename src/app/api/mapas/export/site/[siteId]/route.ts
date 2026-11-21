import { NextResponse } from "next/server";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSiteIndicators } from "@/lib/mapas/site-metrics";
import { buildMcConsolidatedCsv } from "@/lib/mapas/report";

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
    .select("code")
    .eq("id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!site) {
    return NextResponse.json({ error: "Obra não encontrada" }, { status: 404 });
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

  const csv = buildMcConsolidatedCsv({
    indicators,
    pours: filtered.map((p) => ({
      code: p.code,
      title: p.title,
      status: p.status,
      pourDate: p.pour_date,
    })),
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mapaconcreto-${site.code}-consolidado.csv"`,
    },
  });
}
