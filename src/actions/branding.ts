"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Admin substitui o logotipo da organização (não redesenhar a marca). */
export async function uploadLogoAction(formData: FormData) {
  const session = await requireSession(["admin"]);
  const file = formData.get("logo") as File | null;

  if (!file || file.size === 0) {
    redirect("/admin/branding?error=Selecione o arquivo do logotipo");
  }

  const allowed = ["image/png", "image/jpeg", "image/webp", "image/svg+xml"];
  if (!allowed.includes(file.type)) {
    redirect("/admin/branding?error=Use PNG, JPG, WEBP ou SVG");
  }
  if (file.size > 5 * 1024 * 1024) {
    redirect("/admin/branding?error=Logo maior que 5MB");
  }

  const supabase = await createClient();
  const bucket = process.env.STORAGE_BUCKET_LIBRARY || "library";
  const path = `${session.organizationId}/branding/logo-${Date.now()}.${file.name.split(".").pop()}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: true });

  if (upErr) {
    redirect(`/admin/branding?error=${encodeURIComponent(upErr.message)}`);
  }

  await supabase
    .from("organizations")
    .update({ logo_storage_path: path })
    .eq("id", session.organizationId);

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "org.logo_update",
    entity_type: "organizations",
    entity_id: session.organizationId,
    payload: { path },
  });

  revalidatePath("/admin/branding");
  revalidatePath("/dashboard");
  redirect("/admin/branding?ok=Logotipo atualizado");
}
