"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { rectanglePolygon, toGeoJsonPolygon } from "@/lib/mapas/geometry";
import { parseElementsCsv } from "@/lib/mapas/csv-elements";
import type { McElementKind } from "@/lib/mapas/types";

const KINDS = new Set([
  "laje",
  "viga",
  "pilar",
  "parede",
  "fundacao",
  "sapata",
  "radier",
  "outro",
]);

export async function importElementsCsvAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const floorId = String(formData.get("floor_id") || "") || null;
  const drawingId = String(formData.get("drawing_id") || "") || null;
  const file = formData.get("file");

  if (!siteId || !(file instanceof File) || file.size === 0) {
    redirect(`/mapas/${siteId}?error=Selecione um CSV de elementos`);
  }

  const text = await file.text();
  const { rows, errors } = parseElementsCsv(text);
  if (errors.length || !rows.length) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(errors.join("; ") || "Nenhuma linha válida")}`,
    );
  }

  const supabase = await createClient();
  let inserted = 0;
  const fail: string[] = [];

  for (const row of rows) {
    const kind = (KINDS.has(row.kind) ? row.kind : "outro") as McElementKind;
    let geometry = null;
    let area = row.area_m2;
    if (row.width_m && row.depth_m && row.width_m > 0 && row.depth_m > 0) {
      geometry = toGeoJsonPolygon(
        rectanglePolygon(
          row.origin_x || 0,
          row.origin_y || 0,
          row.width_m,
          row.depth_m,
        ),
      );
      area = row.width_m * row.depth_m;
    }

    const volumeTeorico =
      kind === "pilar" || kind === "parede"
        ? row.height_m != null && area
          ? area * row.height_m
          : null
        : row.thickness_m && area
          ? area * row.thickness_m
          : null;

    const { error } = await supabase.from("mc_structural_elements").upsert(
      {
        site_id: siteId,
        floor_id: floorId,
        drawing_revision_id: drawingId,
        organization_id: session.organizationId,
        code: row.code,
        name: row.name,
        kind,
        geometry,
        area_m2: area,
        thickness_m: row.thickness_m,
        height_m: row.height_m,
        volume_teorico_m3: volumeTeorico,
        quantity_source: "planilha",
        reliability: "csv_import",
        is_demo: false,
        created_by: session.userId,
      },
      { onConflict: "site_id,code" },
    );
    if (error) fail.push(`${row.code}: ${error.message}`);
    else inserted += 1;
  }

  revalidatePath(`/mapas/${siteId}`);
  if (fail.length) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(`Importados ${inserted}; falhas: ${fail.join("; ")}`)}`,
    );
  }
  redirect(`/mapas/${siteId}?ok=csv_${inserted}`);
}
