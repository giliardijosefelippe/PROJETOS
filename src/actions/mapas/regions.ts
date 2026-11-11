"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  freehandToPolygon,
  polygonArea,
  rectanglePolygon,
  toGeoJsonPolygon,
  type Point,
} from "@/lib/mapas/geometry";
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
