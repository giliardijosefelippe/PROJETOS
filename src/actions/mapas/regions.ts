"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  freehandToPolygon,
  polygonArea,
  polygonFromGeoJson,
  rectanglePolygon,
  toGeoJsonPolygon,
  type Point,
} from "@/lib/mapas/geometry";
import { subtractVoids } from "@/lib/mapas/boolean";
import { computeRegionElementIntersection } from "@/lib/mapas/quantities";
import type { GeoJsonPolygon } from "@/lib/mapas/geometry";
import type { McElementKind, McRegionTool } from "@/lib/mapas/types";

function parsePoints(raw: string): Point[] {
  const parsed = JSON.parse(raw) as Point[];
  if (!Array.isArray(parsed)) throw new Error("Pontos inválidos");
  return parsed.map((p) => [Number(p[0]), Number(p[1])] as Point);
}

export async function saveRegionAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const drawingId = String(formData.get("drawing_id") || "");
  const name = String(formData.get("name") || "Região").trim() || "Região";
  const tool = String(formData.get("tool") || "polygon") as McRegionTool;
  const pointsRaw = String(formData.get("points_json") || "[]");
  const color = String(formData.get("color") || "#E00024");

  const supabase = await createClient();
  const { data: drawing } = await supabase
    .from("mc_drawing_revisions")
    .select("meters_per_pdf_unit")
    .eq("id", drawingId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  const mpu = drawing?.meters_per_pdf_unit
    ? Number(drawing.meters_per_pdf_unit)
    : null;
  if (!mpu || mpu <= 0) {
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=Calibre a escala antes de salvar regiões`,
    );
  }

  let geometry: GeoJsonPolygon;
  let warnings: { code: string; message: string }[] = [];

  try {
    const pdfPoints = parsePoints(pointsRaw);
    const world = pdfPoints.map(
      ([x, y]) => [x * mpu, y * mpu] as Point,
    );

    if (tool === "rectangle") {
      if (world.length < 2) throw new Error("Retângulo incompleto");
      const xs = world.map((p) => p[0]);
      const ys = world.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      geometry = toGeoJsonPolygon(
        rectanglePolygon(minX, minY, maxX - minX, maxY - minY),
      );
    } else if (tool === "freehand") {
      const { polygon, warnings: w } = freehandToPolygon(world);
      warnings = w;
      if (!polygon) throw new Error(w[0]?.message || "Traço inválido");
      geometry = toGeoJsonPolygon(polygon);
    } else {
      if (world.length < 3) throw new Error("Polígono precisa de 3+ vértices");
      geometry = toGeoJsonPolygon([world]);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Geometria inválida";
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=${encodeURIComponent(msg)}`,
    );
  }

  const area = polygonArea(
    geometry.coordinates.map((ring) =>
      ring.map(([x, y]) => [x, y] as Point),
    ),
  );

  const { data: region, error } = await supabase
    .from("mc_mapped_regions")
    .insert({
      site_id: siteId,
      drawing_revision_id: drawingId,
      organization_id: session.organizationId,
      name,
      tool,
      geometry,
      area_m2: area,
      color,
      notes: warnings.map((w) => w.message).join(" ") || null,
      is_demo: false,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !region) {
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=${encodeURIComponent(error?.message || "Falha")}`,
    );
  }

  // Auto-intersect with elements on same drawing/site
  const { data: elements } = await supabase
    .from("mc_structural_elements")
    .select(
      "id, kind, geometry, area_m2, thickness_m, height_m, volume_teorico_m3, section_area_m2, axis_length_m, executed_length_m",
    )
    .eq("site_id", siteId)
    .eq("organization_id", session.organizationId);

  for (const el of elements || []) {
    const result = computeRegionElementIntersection(
      { id: region.id, geometry, area_m2: area },
      {
        id: el.id,
        kind: el.kind as McElementKind,
        geometry: el.geometry as GeoJsonPolygon | null,
        area_m2: el.area_m2 != null ? Number(el.area_m2) : null,
        thickness_m: el.thickness_m != null ? Number(el.thickness_m) : null,
        height_m: el.height_m != null ? Number(el.height_m) : null,
        volume_teorico_m3:
          el.volume_teorico_m3 != null ? Number(el.volume_teorico_m3) : null,
        section_area_m2:
          el.section_area_m2 != null ? Number(el.section_area_m2) : null,
        axis_length_m:
          el.axis_length_m != null ? Number(el.axis_length_m) : null,
        executed_length_m:
          el.executed_length_m != null ? Number(el.executed_length_m) : null,
      },
    );
    await supabase.from("mc_region_element_intersections").upsert(
      {
        organization_id: session.organizationId,
        region_id: region.id,
        element_id: el.id,
        intersection_area_m2: result.intersectionAreaM2,
        percent: result.percent,
        volume_estimado_m3: result.volumeEstimadoM3,
        method: result.method,
        data_origin: result.dataOrigin,
        precision_note: result.precisionNote,
        warnings: result.warnings,
        indeterminate: result.indeterminate,
        calc_memory: result.calcMemory || null,
        containment: result.containment || null,
      },
      { onConflict: "region_id,element_id" },
    );
  }

  revalidatePath(`/mapas/${siteId}/planta/${drawingId}`);
  redirect(`/mapas/${siteId}/planta/${drawingId}?ok=regiao`);
}

async function recomputeRegionIntersections(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  siteId: string;
  regionId: string;
  geometry: GeoJsonPolygon;
  areaM2: number;
  voids?: GeoJsonPolygon[];
}) {
  const { data: elements } = await args.supabase
    .from("mc_structural_elements")
    .select(
      "id, kind, geometry, area_m2, thickness_m, height_m, volume_teorico_m3, section_area_m2, axis_length_m, executed_length_m",
    )
    .eq("site_id", args.siteId)
    .eq("organization_id", args.orgId);

  for (const el of elements || []) {
    const result = computeRegionElementIntersection(
      {
        id: args.regionId,
        geometry: args.geometry,
        area_m2: args.areaM2,
        voids: args.voids,
      },
      {
        id: el.id,
        kind: el.kind as McElementKind,
        geometry: el.geometry as GeoJsonPolygon | null,
        area_m2: el.area_m2 != null ? Number(el.area_m2) : null,
        thickness_m: el.thickness_m != null ? Number(el.thickness_m) : null,
        height_m: el.height_m != null ? Number(el.height_m) : null,
        volume_teorico_m3:
          el.volume_teorico_m3 != null ? Number(el.volume_teorico_m3) : null,
        section_area_m2:
          el.section_area_m2 != null ? Number(el.section_area_m2) : null,
        axis_length_m:
          el.axis_length_m != null ? Number(el.axis_length_m) : null,
        executed_length_m:
          el.executed_length_m != null ? Number(el.executed_length_m) : null,
      },
    );
    await args.supabase.from("mc_region_element_intersections").upsert(
      {
        organization_id: args.orgId,
        region_id: args.regionId,
        element_id: el.id,
        intersection_area_m2: result.intersectionAreaM2,
        percent: result.percent,
        volume_estimado_m3: result.volumeEstimadoM3,
        method: result.method,
        data_origin: result.dataOrigin,
        precision_note: result.precisionNote,
        warnings: result.warnings,
        indeterminate: result.indeterminate,
        calc_memory: result.calcMemory || null,
        containment: result.containment || null,
      },
      { onConflict: "region_id,element_id" },
    );
  }
}

/** Add a void/island polygon to an existing mapped region (explicit, audited via notes). */
export async function addRegionVoidAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const drawingId = String(formData.get("drawing_id") || "");
  const regionId = String(formData.get("region_id") || "");
  const tool = String(formData.get("tool") || "polygon") as McRegionTool;
  const pointsRaw = String(formData.get("points_json") || "[]");

  if (!regionId) {
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=Selecione a região para o vazio`,
    );
  }

  const supabase = await createClient();
  const { data: drawing } = await supabase
    .from("mc_drawing_revisions")
    .select("meters_per_pdf_unit")
    .eq("id", drawingId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  const mpu = drawing?.meters_per_pdf_unit
    ? Number(drawing.meters_per_pdf_unit)
    : null;
  if (!mpu || mpu <= 0) {
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=Calibre a escala antes de vazios`,
    );
  }

  const { data: region } = await supabase
    .from("mc_mapped_regions")
    .select("id, geometry, voids, area_m2, notes")
    .eq("id", regionId)
    .eq("drawing_revision_id", drawingId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!region) {
    redirect(`/mapas/${siteId}/planta/${drawingId}?error=Região não encontrada`);
  }

  let voidGeom: GeoJsonPolygon;
  try {
    const pdfPoints = parsePoints(pointsRaw);
    const world = pdfPoints.map(([x, y]) => [x * mpu, y * mpu] as Point);
    if (tool === "rectangle") {
      if (world.length < 2) throw new Error("Retângulo incompleto");
      const xs = world.map((p) => p[0]);
      const ys = world.map((p) => p[1]);
      const minX = Math.min(...xs);
      const maxX = Math.max(...xs);
      const minY = Math.min(...ys);
      const maxY = Math.max(...ys);
      voidGeom = toGeoJsonPolygon(
        rectanglePolygon(minX, minY, maxX - minX, maxY - minY),
      );
    } else {
      if (world.length < 3) throw new Error("Polígono precisa de 3+ vértices");
      voidGeom = toGeoJsonPolygon([world]);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Vazio inválido";
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=${encodeURIComponent(msg)}`,
    );
  }

  const existing = (Array.isArray(region.voids) ? region.voids : []) as GeoJsonPolygon[];
  const voids = [...existing, voidGeom];
  const regionPoly = polygonFromGeoJson(region.geometry as GeoJsonPolygon);
  if (!regionPoly) {
    redirect(`/mapas/${siteId}/planta/${drawingId}?error=Geometria da região inválida`);
  }
  const voidPolys = voids
    .map((v) => polygonFromGeoJson(v))
    .filter(Boolean) as ReturnType<typeof polygonFromGeoJson>[];
  const { area: netArea } = subtractVoids(
    regionPoly,
    voidPolys as NonNullable<(typeof voidPolys)[number]>[],
  );

  await supabase
    .from("mc_mapped_regions")
    .update({
      voids,
      area_m2: netArea,
      notes: [region.notes, `Vazio/ilha #${voids.length} adicionado`]
        .filter(Boolean)
        .join(" · "),
      updated_at: new Date().toISOString(),
    })
    .eq("id", regionId)
    .eq("organization_id", session.organizationId);

  await recomputeRegionIntersections({
    supabase,
    orgId: session.organizationId,
    siteId,
    regionId,
    geometry: region.geometry as GeoJsonPolygon,
    areaM2: netArea,
    voids,
  });

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "mc.region.void_add",
    entity_type: "mc_mapped_regions",
    entity_id: regionId,
    payload: {
      before: { voidsCount: existing.length, area_m2: region.area_m2 },
      after: { voidsCount: voids.length, area_m2: netArea },
    },
  });

  revalidatePath(`/mapas/${siteId}/planta/${drawingId}`);
  redirect(`/mapas/${siteId}/planta/${drawingId}?ok=vazio`);
}
