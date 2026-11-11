"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { detectDrawingFormat, validateUpload } from "@/lib/validation/upload";
import { parseDxfViaService, cadConvertHealth } from "@/lib/cad/client";
import { dxfTextToCadModel } from "@/lib/mapas/dxf";

const BUCKET = process.env.STORAGE_BUCKET_LIBRARY || "library";

/**
 * Upload DWG: original imutável + conversão ODA→DXF via CAD_CONVERT_URL.
 * Sem ODA / sem serviço → erro explícito (não há SDK pago embutido).
 */
export async function uploadPlantDwgAction(formData: FormData) {
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
    String(formData.get("title") || "Planta DWG").trim() || "Planta DWG";
  const isDemo = String(formData.get("is_demo") || "") === "1";
  const file = formData.get("file");

  if (!siteId || !(file instanceof File) || file.size === 0) {
    redirect(`/mapas/${siteId}?error=Selecione um arquivo DWG`);
  }

  if (detectDrawingFormat(file) !== "dwg") {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(
        "Envie um .dwg. Alternativa sem ODA: converta localmente para DXF e use Importar DXF.",
      )}`,
    );
  }

  const validation = validateUpload("drawing", file);
  if (!validation.ok) {
    redirect(`/mapas/${siteId}?error=${encodeURIComponent(validation.message)}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const health = await cadConvertHealth();
  if (!health.ok) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(
        `Serviço CAD indisponível (${health.error || "offline"}). Suba services/cad-convert ou envie DXF intermediário.`,
      )}`,
    );
  }
  if (!health.dwg_supported && !health.oda_file_converter) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(
        "ODA File Converter não encontrado no serviço (DWG_CONVERTER_MISSING). Instale o ODA gratuito ou envie DXF já convertido. Sem SDK pago.",
      )}`,
    );
  }

  const parsed = await parseDxfViaService(file.name, buffer);
  if (!parsed.ok) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(
        parsed.error ||
          "Falha ao converter/parsear DWG. Verifique ODA e CAD_CONVERT_URL.",
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
      contentType: "image/vnd.dwg",
      upsert: false,
    });
  if (upErr) {
    redirect(`/mapas/${siteId}?error=${encodeURIComponent(upErr.message)}`);
  }

  let intermediatePath: string | null = null;
  const intermediateB64 = (parsed as { intermediate_dxf_base64?: string })
    .intermediate_dxf_base64;
  if (intermediateB64) {
    const dxfBuf = Buffer.from(intermediateB64, "base64");
    intermediatePath = `${session.organizationId}/mapas/${siteId}/${revisionCode}_${contentHash.slice(0, 12)}_intermediate.dxf`;
    await supabase.storage.from(BUCKET).upload(intermediatePath, dxfBuf, {
      contentType: "application/dxf",
      upsert: false,
    });
  }

  // Prefer service entities; fallback empty with warning
  const layers = (parsed.layers as unknown[]) || [];
  const entities = (parsed.entities as unknown[]) || [];
  const units = parsed.units || { insunits: null, label: "from_oda", toMeters: 1 };
  const warnings = [
    ...((parsed.warnings as string[]) || []),
    "DWG original preservado; geometria via DXF intermediário (ODA). Sem suporte nativo a DWG binário.",
    "Elementos estruturais NÃO criados automaticamente a partir do DWG.",
  ];

  // If service returned nothing usable, try TS parse on intermediate DXF text
  let cadLayers = layers;
  let cadEntities = entities;
  let cadWarnings = warnings;
  let cadParser = (parsed as { parser?: string }).parser || "oda+ezdxf";
  let cadUnitLabel = units.label;
  let cadUnitToM = units.toMeters;
  let cadInsunits = units.insunits ?? null;
  let cadBbox: unknown = null;

  if ((!entities.length || !layers.length) && intermediateB64) {
    const text = Buffer.from(intermediateB64, "base64").toString("utf8");
    const model = dxfTextToCadModel(text, { isDemo, parser: "ts-ascii" });
    cadLayers = model.layers;
    cadEntities = model.entities;
    cadWarnings = [...warnings, ...model.warnings];
    cadParser = model.parser;
    cadUnitLabel = model.units.label;
    cadUnitToM = model.units.toMeters;
    cadInsunits = model.units.insunits;
    cadBbox = model.bboxMeters;
  }

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
      mime_type: "image/vnd.dwg",
      source_kind: "dwg",
      page_count: 1,
      selected_page: 1,
      unit: "m",
      meters_per_pdf_unit: 1,
      scale_real_m: 1,
      scale_p1: [0, 0],
      scale_p2: [1, 0],
      cad_parser: cadParser,
      cad_insunits: cadInsunits,
      cad_unit_label: cadUnitLabel,
      cad_unit_to_m: cadUnitToM,
      cad_layers: cadLayers,
      cad_entities: cadEntities,
      cad_warnings: cadWarnings,
      cad_bbox: cadBbox,
      intermediate_storage_path: intermediatePath,
      intermediate_format: intermediatePath ? "dxf" : null,
      converter_path: "oda+ezdxf",
      is_demo: isDemo,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(error?.message || "Falha ao registrar DWG")}`,
    );
  }

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "mc.drawing.dwg_upload",
    entity_type: "mc_drawing_revisions",
    entity_id: data.id,
    payload: {
      revisionCode,
      contentHash,
      converter: "oda+ezdxf",
      intermediateFormat: "dxf",
      note: "DWG via DXF intermediário; sem SDK pago",
    },
  });

  revalidatePath(`/mapas/${siteId}`);
  redirect(`/mapas/${siteId}/planta/${data.id}`);
}
