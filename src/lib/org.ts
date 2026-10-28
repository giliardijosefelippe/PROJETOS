import { createClient } from "@/lib/supabase/server";

export async function getOrgLogoSignedUrl(organizationId: string) {
  if (!organizationId) return null;
  const supabase = await createClient();
  const { data: org } = await supabase
    .from("organizations")
    .select("logo_storage_path")
    .eq("id", organizationId)
    .maybeSingle();

  if (!org?.logo_storage_path) return null;

  const bucket = process.env.STORAGE_BUCKET_LIBRARY || "library";
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrl(org.logo_storage_path, 3600);

  return data?.signedUrl || null;
}
