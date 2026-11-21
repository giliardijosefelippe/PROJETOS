"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseIfcStep } from "@/lib/mapas/ifc";
import type { McElementKind } from "@/lib/mapas/types";

const BUCKET = process.env.STORAGE_BUCKET_LIBRARY || "library";

function isIfcFile(file: File) {
  const name = file.name.toLowerCase();
  return name.endsWith(".ifc") || name.endsWith(".ifcxml");
}

/**
 * Import IFC: preserve GUID/properties/Qto; create elements without inventing volumes.
 * 3D viewer intentionally skipped (documented in plano-fase-3).
 */
export async function uploadIfcAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador", "desenhista"]);
  const siteId = String(formData.get("site_id") || "");
  const floorId = String(formData.get("floor_id") || "") || null;
  const revisionCode =
    String(formData.get("revision_code") || "R00").trim() || "R00";
  const title =
    String(formData.get("title") || "Modelo IFC").trim() || "Modelo IFC";
  const isDemo = String(formData.get("is_demo") || "") === "1";
  const createElements =
    String(formData.get("create_elements") || "1") === "1";
  const file = formData.get("file");

  if (!siteId || !(file instanceof File) || file.size === 0) {
    redirect(`/mapas/${siteId}?error=Selecione um arquivo IFC`);
  }
  if (!isIfcFile(file)) {
    redirect(`/mapas/${siteId}?error=Envie um arquivo .ifc`);
  }

  const max = Number(process.env.UPLOAD_MAX_BYTES_DRAWING || 40 * 1024 * 1024);
  if (file.size > max) {
    redirect(`/mapas/${siteId}?error=Arquivo IFC maior que o limite`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const text = buffer.toString("utf8");
  const model = parseIfcStep(text, { isDemo });

  if (!model.ok && !model.elements.length) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(
        model.warnings[0] || "IFC inválido ou sem entidades reconhecidas",
      )}`,
    );
  }

  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${session.organizationId}/mapas/${siteId}/${revisionCode}_${contentHash.slice(0, 12)}_${safeName}`;

  const supabase = await createClient();
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/x-step",
      upsert: false,
    });
  if (upErr) {
    redirect(`/mapas/${siteId}?error=${encodeURIComponent(upErr.message)}`);
  }

  const summary = {
    elementCount: model.elements.length,
    withVolume: model.elements.filter((e) => e.volumeM3 != null).length,
    withoutVolume: model.elements.filter((e) => e.volumeM3 == null).length,
    schema: model.schema,
    unit: model.unit,
    viewer3d: false,
    note: "Vista 3D adiada; listagem + footprint 2D quando disponível.",
  };

  const { data: drawing, error } = await supabase
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
      mime_type: "application/x-step",
      source_kind: "ifc",
      page_count: 1,
      selected_page: 1,
      unit: "m",
      meters_per_pdf_unit: model.unit.toMeters,
      scale_real_m: 1,
      scale_p1: [0, 0],
      scale_p2: [1, 0],
      cad_parser: model.parser,
      cad_unit_label: model.unit.name,
      cad_unit_to_m: model.unit.toMeters,
      cad_layers: [],
      cad_entities: model.elements
        .filter((e) => e.footprint)
        .map((e) => ({
          id: e.guid,
          layer: e.ifcType,
          sourceType: e.ifcType,
          geometryKind: "Polygon",
          coordinates: e.footprint?.coordinates,
          warnings: e.warnings,
        })),
      cad_warnings: model.warnings,
      cad_bbox: null,
      converter_path: "ts-ifc-step",
      ifc_schema: model.schema,
      ifc_project_name: model.projectName,
      ifc_unit_to_m: model.unit.toMeters,
      ifc_summary: summary,
      is_demo: isDemo || model.isDemo,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !drawing) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(error?.message || "Falha ao registrar IFC")}`,
    );
  }

  let created = 0;
  let skipped = 0;
  if (createElements) {
    for (const el of model.elements) {
      const code =
        (el.tag && el.tag.slice(0, 40)) ||
        el.name.slice(0, 40) ||
        el.guid.slice(0, 22);
      const { error: elErr } = await supabase.from("mc_structural_elements").upsert(
        {
          site_id: siteId,
          floor_id: floorId,
          drawing_revision_id: drawing.id,
          organization_id: session.organizationId,
          code: `IFC-${code}`.replace(/\s+/g, "_").slice(0, 64),
          name: el.name,
          kind: el.kind as McElementKind,
          geometry: el.footprint,
          area_m2: el.areaM2,
          thickness_m: el.thicknessM,
          height_m: el.heightM,
          volume_teorico_m3: el.volumeM3,
          quantity_source: el.volumeM3 != null ? "ifc" : "manual",
          reliability:
            el.volumeM3 != null ? "ifc_qto" : "ifc_sem_volume",
          ifc_guid: el.guid,
          ifc_type: el.ifcType,
          ifc_properties: {
            objectType: el.objectType,
            tag: el.tag,
            properties: el.properties,
            quantities: el.quantities,
            warnings: el.warnings,
          },
          ifc_quantity_origin: el.quantityOrigin,
          is_demo: isDemo || model.isDemo,
          created_by: session.userId,
        },
        { onConflict: "site_id,code" },
      );
      if (elErr) skipped++;
      else created++;
    }
  }

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "mc.drawing.ifc_upload",
    entity_type: "mc_drawing_revisions",
    entity_id: drawing.id,
    payload: {
      revisionCode,
      contentHash,
      created,
      skipped,
      summary,
      note: "IFC importado sem inventar volumes; sem viewer 3D",
    },
  });

  revalidatePath(`/mapas/${siteId}`);
  redirect(
    `/mapas/${siteId}/planta/${drawing.id}?ok=ifc_${created}_elementos`,
  );
}
