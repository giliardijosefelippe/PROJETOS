"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { convertCadBundle } from "@/lib/cad/client";
import {
  detectDrawingFormat,
  uploadErrorRedirect,
  validateUpload,
} from "@/lib/validation/upload";

function drawingsBucket() {
  return process.env.STORAGE_BUCKET_LIBRARY || "library";
}

export async function uploadDrawingFileAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const revisionId = String(formData.get("revision_id") || "");
  const file = formData.get("file") as File | null;
  const base = `/revisions/${revisionId}`;

  const validation = validateUpload("drawing", file);
  if (!validation.ok) {
    redirect(uploadErrorRedirect(base, validation));
  }

  const supabase = await createClient();
  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select("id, immutable, organization_id")
    .eq("id", revisionId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!revision) {
    redirect(`${base}?error=${encodeURIComponent("Revisão não encontrada")}`);
  }
  if (revision.immutable) {
    redirect(
      `${base}?error=${encodeURIComponent("Revisão imutável — crie nova revisão")}`,
    );
  }

  const format = detectDrawingFormat(file!);
  const buffer = Buffer.from(await file!.arrayBuffer());
  const bucket = drawingsBucket();
  const stamp = Date.now();
  const safeName = file!.name.replace(/[^\w.\-()+ ]+/g, "_");
  const originalPath = `${session.organizationId}/drawings/${revisionId}/${stamp}-original-${safeName}`;

  const contentType =
    file!.type ||
    (format === "pdf"
      ? "application/pdf"
      : format === "dxf"
        ? "application/dxf"
        : format === "dwg"
          ? "application/acad"
          : "application/octet-stream");

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(originalPath, buffer, { contentType, upsert: false });

  if (upErr) {
    redirect(`${base}?error=${encodeURIComponent(upErr.message)}`);
  }

  const { data: originalRow, error: insErr } = await supabase
    .from("drawing_files")
    .insert({
      revision_id: revisionId,
      organization_id: session.organizationId,
      storage_path: originalPath,
      file_name: file!.name,
      mime_type: contentType,
      size_bytes: file!.size,
      uploaded_by: session.userId,
      kind: "original",
      source_format: format,
      converter_path: format === "pdf" ? "passthrough-pdf" : null,
    })
    .select("id")
    .single();

  if (insErr) {
    redirect(`${base}?error=${encodeURIComponent(insErr.message)}`);
  }

  // PDF: also store as preview_pdf pointing to same bytes (annotation pipeline)
  if (format === "pdf") {
    await supabase.from("drawing_files").insert({
      revision_id: revisionId,
      organization_id: session.organizationId,
      storage_path: originalPath,
      file_name: file!.name.replace(/\.pdf$/i, "") + "-preview.pdf",
      mime_type: "application/pdf",
      size_bytes: file!.size,
      uploaded_by: session.userId,
      kind: "preview_pdf",
      source_format: "pdf",
      parent_file_id: originalRow.id,
      converter_path: "passthrough-pdf",
    });

    await supabase.from("audit_events").insert({
      organization_id: session.organizationId,
      actor_id: session.userId,
      action: "drawing_file.upload",
      entity_type: "drawing_files",
      entity_id: originalRow.id,
      payload: { format, revision_id: revisionId },
    });

    revalidatePath(base);
    revalidatePath(`${base}/annotations`);
    redirect(`${base}?ok=${encodeURIComponent("PDF da prancha anexado")}`);
  }

  // DXF / DWG → Python service
  let bundle;
  try {
    bundle = await convertCadBundle(file!.name, buffer, contentType);
  } catch (err) {
    const msg =
      err instanceof Error
        ? err.message
        : "Falha na conversão CAD. Original foi salvo.";
    revalidatePath(base);
    redirect(`${base}?error=${encodeURIComponent(msg)}`);
  }

  const pdfPath = `${session.organizationId}/drawings/${revisionId}/${stamp}-preview.pdf`;
  const pngPath = `${session.organizationId}/drawings/${revisionId}/${stamp}-preview.png`;

  const { error: pdfUp } = await supabase.storage
    .from(bucket)
    .upload(pdfPath, bundle.pdf_bytes, {
      contentType: "application/pdf",
      upsert: false,
    });
  const { error: pngUp } = await supabase.storage
    .from(bucket)
    .upload(pngPath, bundle.png_bytes, {
      contentType: "image/png",
      upsert: false,
    });

  if (pdfUp || pngUp) {
    redirect(
      `${base}?error=${encodeURIComponent(
        pdfUp?.message || pngUp?.message || "Falha ao gravar preview",
      )}`,
    );
  }

  await supabase.from("drawing_files").insert([
    {
      revision_id: revisionId,
      organization_id: session.organizationId,
      storage_path: pdfPath,
      file_name: `${safeName}-preview.pdf`,
      mime_type: "application/pdf",
      size_bytes: bundle.pdf_bytes.length,
      uploaded_by: session.userId,
      kind: "preview_pdf",
      source_format: bundle.source_format,
      parent_file_id: originalRow.id,
      converter_path: bundle.converter_path,
    },
    {
      revision_id: revisionId,
      organization_id: session.organizationId,
      storage_path: pngPath,
      file_name: `${safeName}-preview.png`,
      mime_type: "image/png",
      size_bytes: bundle.png_bytes.length,
      uploaded_by: session.userId,
      kind: "preview_png",
      source_format: bundle.source_format,
      parent_file_id: originalRow.id,
      converter_path: bundle.converter_path,
    },
  ]);

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "drawing_file.convert",
    entity_type: "drawing_files",
    entity_id: originalRow.id,
    payload: {
      format: bundle.source_format,
      converter_path: bundle.converter_path,
      notes: bundle.notes,
      revision_id: revisionId,
    },
  });

  revalidatePath(base);
  revalidatePath(`${base}/annotations`);
  redirect(
    `${base}?ok=${encodeURIComponent(
      `CAD convertido (${bundle.converter_path}) — preview PDF/PNG pronto`,
    )}`,
  );
}
