"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import {
  validateUpload,
  uploadErrorRedirect,
} from "@/lib/validation/upload";

/** Admin substitui o logotipo da organização (não redesenhar a marca). */
export async function uploadLogoAction(formData: FormData) {
  const session = await requireSession(["admin"]);
  const file = formData.get("logo") as File | null;

  const validation = validateUpload("logo", file);
  if (!validation.ok) {
    redirect(uploadErrorRedirect("/admin/branding", validation));
  }

  const supabase = await createClient();
  const bucket = process.env.STORAGE_BUCKET_LIBRARY || "library";
  const path = `${session.organizationId}/branding/logo-${Date.now()}.${file!.name.split(".").pop()}`;
  const buffer = Buffer.from(await file!.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file!.type, upsert: true });

  if (upErr) {
    redirect(`/admin/branding?error=${encodeURIComponent(upErr.message)}`);
  }

  await supabase
    .from("organizations")
    .update({ logo_storage_path: path })
    .eq("id", session.organizationId);

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "org.logo_update",
    entityType: "organizations",
    entityId: session.organizationId,
    payload: { path },
  });

  revalidatePath("/admin/branding");
  revalidatePath("/dashboard");
  redirect("/admin/branding?ok=Logotipo atualizado");
}
