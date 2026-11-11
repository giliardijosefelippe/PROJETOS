"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rectanglePolygon, toGeoJsonPolygon } from "@/lib/mapas/geometry";
import type { McElementKind } from "@/lib/mapas/types";

export async function createElementAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const drawingId = String(formData.get("drawing_id") || "") || null;
  const floorId = String(formData.get("floor_id") || "") || null;
  const code = String(formData.get("code") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const kind = String(formData.get("kind") || "laje") as McElementKind;
  const areaM2 = Number(formData.get("area_m2") || 0);
  const thicknessM = Number(formData.get("thickness_m") || 0);
  const heightMRaw = formData.get("height_m");
  const heightM =
    heightMRaw === null || String(heightMRaw).trim() === ""
      ? null
      : Number(heightMRaw);
  const originX = Number(formData.get("origin_x") || 0);
  const originY = Number(formData.get("origin_y") || 0);
  const widthM = Number(formData.get("width_m") || 0);
  const depthM = Number(formData.get("depth_m") || 0);

  if (!siteId || !code || !name) {
    redirect(`/mapas/${siteId}?error=Preencha código e nome do elemento`);
  }

  let geometry = null;
  let area = areaM2;
  if (widthM > 0 && depthM > 0) {
    geometry = toGeoJsonPolygon(
      rectanglePolygon(originX, originY, widthM, depthM),
    );
    area = widthM * depthM;
  }

  const volumeTeorico =
    kind === "pilar" || kind === "parede"
      ? heightM != null && heightM > 0
        ? area * heightM
        : null
      : thicknessM > 0
        ? area * thicknessM
        : null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mc_structural_elements")
    .insert({
      site_id: siteId,
      floor_id: floorId,
      drawing_revision_id: drawingId,
      organization_id: session.organizationId,
      code,
      name,
      kind,
      geometry,
      area_m2: area || null,
      thickness_m: thicknessM || null,
      height_m: heightM,
      volume_teorico_m3: volumeTeorico,
      quantity_source: "manual",
      reliability: geometry ? "geometria_manual" : "area_manual",
      is_demo: false,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    const target = drawingId
      ? `/mapas/${siteId}/planta/${drawingId}`
      : `/mapas/${siteId}`;
    redirect(`${target}?error=${encodeURIComponent(error?.message || "Falha")}`);
  }

  const target = drawingId
    ? `/mapas/${siteId}/planta/${drawingId}`
    : `/mapas/${siteId}`;
  revalidatePath(target);
  redirect(`${target}?ok=elemento`);
}
