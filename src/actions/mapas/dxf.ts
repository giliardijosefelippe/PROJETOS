"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/validation/upload";
import { detectDrawingFormat } from "@/lib/validation/upload";
import { dxfTextToCadModel } from "@/lib/mapas/dxf";

const BUCKET = process.env.STORAGE_BUCKET_LIBRARY || "library";

export async function uploadPlantDxfAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const floorId = String(formData.get("floor_id") || "") || null;
  const revisionCode =
    String(formData.get("revision_code") || "R00").trim() || "R00";
  const title =
    String(formData.get("title") || "Planta DXF").trim() || "Planta DXF";
  const isDemo = String(formData.get("is_demo") || "") === "1";
  const file = formData.get("file");

  if (!siteId || !(file instanceof File) || file.size === 0) {
    redirect(`/mapas/${siteId}?error=Selecione um arquivo DXF`);
  }

  const format = detectDrawingFormat(file);
  if (format !== "dxf") {
    redirect(
      `/mapas/${siteId}?error=Apenas DXF ASCII neste incremento (DWG/IFC fora do escopo sem autorização)`,
    );
  }

  const validation = validateUpload("drawing", file);
  if (!validation.ok) {
    redirect(`/mapas/${siteId}?error=${encodeURIComponent(validation.message)}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const text = buffer.toString("utf8");
  const model = dxfTextToCadModel(text, {
    isDemo,
    parser: "ts-ascii",
  });

  if (!model.entities.length && model.warnings.length) {
    // still allow store of original with warnings
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${session.organizationId}/mapas/${siteId}/${revisionCode}_${contentHash.slice(0, 12)}_${safeName}`;

  const supabase = await createClient();
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/dxf",
      upsert: false,
    });

  if (upErr) {
    redirect(`/mapas/${siteId}?error=${encodeURIComponent(upErr.message)}`);
  }

  // DXF coords already in meters after unit conversion — use identity scale for region tools
  const { data, error } = await supabase
    .from("mc_drawing_revisions")
    .insert({
      site_id: siteId,
      floor_id: floorId,
      organization_id: session.organizationId,
      revision_code: revisionCode,
      title,
      file_name: file.name,
      storage_path: storagePath,
      content_hash: contentHash,
      mime_type: "application/dxf",
      source_kind: "dxf",
      page_count: 1,
      selected_page: 1,
      unit: "m",
      meters_per_pdf_unit: 1,
      scale_real_m: 1,
      scale_p1: [0, 0],
      scale_p2: [1, 0],
      cad_parser: model.parser,
      cad_insunits: model.units.insunits,
      cad_unit_label: model.units.label,
      cad_unit_to_m: model.units.toMeters,
      cad_layers: model.layers,
      cad_entities: model.entities,
      cad_warnings: model.warnings,
      cad_bbox: model.bboxMeters,
      is_demo: isDemo || model.isDemo,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(error?.message || "Falha ao registrar DXF")}`,
    );
  }

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "mc.drawing.dxf_upload",
    entity_type: "mc_drawing_revisions",
    entity_id: data.id,
    payload: {
      revisionCode,
      contentHash,
      layers: model.layers.map((l) => l.name),
      entityCount: model.entities.length,
      units: model.units,
      note: "DXF importado; elementos estruturais NÃO criados automaticamente",
    },
  });

  revalidatePath(`/mapas/${siteId}`);
  redirect(`/mapas/${siteId}/planta/${data.id}`);
}
