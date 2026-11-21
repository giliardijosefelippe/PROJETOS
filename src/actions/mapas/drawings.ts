"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/validation/upload";
import { metersPerPdfUnit } from "@/lib/mapas/geometry";

const BUCKET = process.env.STORAGE_BUCKET_LIBRARY || "library";

export async function uploadPlantPdfAction(formData: FormData) {
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
    String(formData.get("title") || "Planta estrutural").trim() ||
    "Planta estrutural";
  const file = formData.get("file");

  if (!siteId || !(file instanceof File) || file.size === 0) {
    redirect(`/mapas/${siteId}?error=Selecione um PDF válido`);
  }

  const validation = validateUpload("pdf", file);
  if (!validation.ok) {
    redirect(`/mapas/${siteId}?error=${encodeURIComponent(validation.message)}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash("sha256").update(buffer).digest("hex");
  const safeName = file.name.replace(/[^\w.\-]+/g, "_");
  const storagePath = `${session.organizationId}/mapas/${siteId}/${revisionCode}_${contentHash.slice(0, 12)}_${safeName}`;

  const supabase = await createClient();
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, buffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (upErr) {
    const msg = /already exists|Duplicate|409/i.test(upErr.message)
      ? "Este arquivo já foi enviado (ou conflito no Storage). Renomeie ou use outra revisão."
      : `Falha no upload do PDF: ${upErr.message}`;
    redirect(`/mapas/${siteId}?error=${encodeURIComponent(msg)}`);
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
      mime_type: "application/pdf",
      page_count: 1,
      selected_page: 1,
      unit: "m",
      is_demo: false,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/mapas/${siteId}?error=${encodeURIComponent(error?.message || "Falha ao registrar revisão")}`,
    );
  }

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "mc.drawing.upload",
    entity_type: "mc_drawing_revisions",
    entity_id: data.id,
    payload: { revisionCode, contentHash, fileName: file.name },
  });

  revalidatePath(`/mapas/${siteId}`);
  redirect(`/mapas/${siteId}/planta/${data.id}`);
}

export async function calibrateScaleAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const drawingId = String(formData.get("drawing_id") || "");
  const siteId = String(formData.get("site_id") || "");
  const p1x = Number(formData.get("p1x"));
  const p1y = Number(formData.get("p1y"));
  const p2x = Number(formData.get("p2x"));
  const p2y = Number(formData.get("p2y"));
  const realM = Number(formData.get("real_m"));

  if (!drawingId || ![p1x, p1y, p2x, p2y, realM].every((n) => Number.isFinite(n))) {
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=${encodeURIComponent(
        "Calibração incompleta — marque dois pontos e informe a distância real em metros.",
      )}`,
    );
  }
  if (realM <= 0) {
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=${encodeURIComponent(
        "A distância real deve ser maior que zero (metros).",
      )}`,
    );
  }
  if (p1x === p2x && p1y === p2y) {
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=${encodeURIComponent(
        "Os dois pontos de escala coincidem — escolha extremos distintos da cota.",
      )}`,
    );
  }

  const mpu = metersPerPdfUnit({
    p1: [p1x, p1y],
    p2: [p2x, p2y],
    realDistanceM: realM,
  });
  if (mpu == null) {
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=${encodeURIComponent(
        "Não foi possível calcular a escala — verifique pontos e distância.",
      )}`,
    );
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("mc_drawing_revisions")
    .update({
      scale_p1: [p1x, p1y],
      scale_p2: [p2x, p2y],
      scale_real_m: realM,
      meters_per_pdf_unit: mpu,
      updated_at: new Date().toISOString(),
    })
    .eq("id", drawingId)
    .eq("organization_id", session.organizationId);

  if (error) {
    redirect(
      `/mapas/${siteId}/planta/${drawingId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/mapas/${siteId}/planta/${drawingId}`);
  redirect(`/mapas/${siteId}/planta/${drawingId}?ok=escala`);
}

export async function selectPageAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const drawingId = String(formData.get("drawing_id") || "");
  const siteId = String(formData.get("site_id") || "");
  const page = Math.max(1, Number(formData.get("page") || 1));
  const pageCount = Math.max(1, Number(formData.get("page_count") || 1));

  const supabase = await createClient();
  await supabase
    .from("mc_drawing_revisions")
    .update({
      selected_page: Math.min(page, pageCount),
      page_count: pageCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", drawingId)
    .eq("organization_id", session.organizationId);

  revalidatePath(`/mapas/${siteId}/planta/${drawingId}`);
}

export async function createDrawingRevisionCopyAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const sourceId = String(formData.get("drawing_id") || "");
  const siteId = String(formData.get("site_id") || "");
  const newCode = String(formData.get("revision_code") || "").trim();

  if (!sourceId || !newCode) {
    redirect(`/mapas/${siteId}/planta/${sourceId}?error=Informe o código da nova revisão`);
  }

  const supabase = await createClient();
  const { data: source } = await supabase
    .from("mc_drawing_revisions")
    .select("*")
    .eq("id", sourceId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!source) {
    redirect(`/mapas/${siteId}?error=Revisão origem não encontrada`);
  }

  // New revision reuses the same immutable file; mappings stay on the old revision.
  // Never copies/repositions regions — user must reconcile explicitly.
  const { data, error } = await supabase
    .from("mc_drawing_revisions")
    .insert({
      site_id: source.site_id,
      floor_id: source.floor_id,
      organization_id: session.organizationId,
      revision_code: newCode,
      title: source.title,
      file_name: source.file_name,
      storage_path: source.storage_path,
      content_hash: source.content_hash,
      mime_type: source.mime_type,
      page_count: source.page_count,
      selected_page: source.selected_page,
      scale_p1: source.scale_p1,
      scale_p2: source.scale_p2,
      scale_real_m: source.scale_real_m,
      meters_per_pdf_unit: source.meters_per_pdf_unit,
      unit: source.unit,
      source_kind: source.source_kind || "pdf",
      cad_parser: source.cad_parser,
      cad_insunits: source.cad_insunits,
      cad_unit_label: source.cad_unit_label,
      cad_unit_to_m: source.cad_unit_to_m,
      cad_layers: source.cad_layers || [],
      cad_entities: source.cad_entities || [],
      cad_warnings: source.cad_warnings || [],
      cad_bbox: source.cad_bbox,
      supersedes_revision_id: sourceId,
      is_demo: false,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/mapas/${siteId}/planta/${sourceId}?error=${encodeURIComponent(error?.message || "Falha")}`,
    );
  }

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "mc.drawing.revision",
    entity_type: "mc_drawing_revisions",
    entity_id: data.id,
    payload: {
      from: sourceId,
      supersedes_revision_id: sourceId,
      note: "Nova revisão sem reposicionar mapeamentos antigos; reconciliação assistida pendente",
    },
  });

  revalidatePath(`/mapas/${siteId}`);
  redirect(`/mapas/${siteId}/planta/${data.id}/reconciliar`);
}
