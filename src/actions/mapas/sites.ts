"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export async function createSiteAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const code = String(formData.get("code") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const buildingName =
    String(formData.get("building_name") || "Torre A").trim() || "Torre A";
  const floorName =
    String(formData.get("floor_name") || "Pavimento tipo").trim() ||
    "Pavimento tipo";

  if (!code || !name) {
    redirect("/mapas/nova?error=Código e nome da obra são obrigatórios");
  }

  const supabase = await createClient();
  const { data: site, error } = await supabase
    .from("mc_sites")
    .insert({
      organization_id: session.organizationId,
      code,
      name,
      description,
      is_demo: false,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !site) {
    redirect(
      `/mapas/nova?error=${encodeURIComponent(error?.message || "Falha ao criar obra")}`,
    );
  }

  const { data: building } = await supabase
    .from("mc_buildings")
    .insert({
      site_id: site.id,
      organization_id: session.organizationId,
      name: buildingName,
      code: "T-A",
    })
    .select("id")
    .single();

  if (building) {
    await supabase.from("mc_floors").insert({
      building_id: building.id,
      organization_id: session.organizationId,
      name: floorName,
      level_index: 1,
    });
  }

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "mc.site.create",
    entity_type: "mc_sites",
    entity_id: site.id,
    payload: { code, name },
  });

  revalidatePath("/mapas");
  redirect(`/mapas/${site.id}`);
}
