"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateUpload } from "@/lib/validation/upload";

const EVIDENCE = process.env.STORAGE_BUCKET_EVIDENCE || "evidence";

export async function createPourAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const floorId = String(formData.get("floor_id") || "") || null;
  const code = String(formData.get("code") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const pourDate = String(formData.get("pour_date") || "") || null;
  const fck = Number(formData.get("fck_mpa") || 0) || null;
  const slumpSpec = Number(formData.get("slump_spec_mm") || 0) || null;
  const volumePlanned = Number(formData.get("volume_planned_m3") || 0) || null;
  const regionIds = formData.getAll("region_id").map(String).filter(Boolean);
  const elementIds = formData.getAll("element_id").map(String).filter(Boolean);

  if (!siteId || !code || !title) {
    redirect(`/mapas/${siteId}/concretagens?error=Código e título obrigatórios`);
  }

  const supabase = await createClient();
  const { data: pour, error } = await supabase
    .from("mc_concrete_pours")
    .insert({
      site_id: siteId,
      floor_id: floorId,
      organization_id: session.organizationId,
      code,
      title,
      status: "em_execucao",
      pour_date: pourDate,
      fck_mpa: fck,
      slump_spec_mm: slumpSpec,
      volume_planned_m3: volumePlanned,
      is_demo: false,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !pour) {
    redirect(
      `/mapas/${siteId}/concretagens?error=${encodeURIComponent(error?.message || "Falha")}`,
    );
  }

  if (regionIds.length) {
    await supabase.from("mc_pour_regions").insert(
      regionIds.map((region_id) => ({
        pour_id: pour.id,
        region_id,
        organization_id: session.organizationId,
      })),
    );
  }
  if (elementIds.length) {
    await supabase.from("mc_pour_elements").insert(
      elementIds.map((element_id) => ({
        pour_id: pour.id,
        element_id,
        organization_id: session.organizationId,
      })),
    );
  }

  revalidatePath(`/mapas/${siteId}/concretagens`);
  redirect(`/mapas/${siteId}/concretagens/${pour.id}`);
}

export async function createDeliveryAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const pourId = String(formData.get("pour_id") || "") || null;
  const nf = String(formData.get("nf_number") || "").trim();
  const plate = String(formData.get("plate") || "").trim() || null;
  const volumeNf = Number(formData.get("volume_nf_m3") || 0);
  const volumeReturned = Number(formData.get("volume_returned_m3") || 0);
  const volumeOther = Number(formData.get("volume_other_dest_m3") || 0);
  const supplierName =
    String(formData.get("supplier_name") || "Concreteira Demo").trim() ||
    "Concreteira Demo";
  const regionId = String(formData.get("region_id") || "") || null;
  const allocVolume = Number(formData.get("volume_allocated_m3") || 0);

  if (!siteId || !nf || !(volumeNf > 0)) {
    redirect(
      `/mapas/${siteId}/concretagens/${pourId}?error=NF e volume são obrigatórios`,
    );
  }

  const supabase = await createClient();
  let supplierId: string | null = null;
  const { data: supplier } = await supabase
    .from("mc_suppliers")
    .insert({
      organization_id: session.organizationId,
      name: supplierName,
      is_demo: false,
    })
    .select("id")
    .single();
  supplierId = supplier?.id ?? null;

  const { data: delivery, error } = await supabase
    .from("mc_truck_deliveries")
    .insert({
      organization_id: session.organizationId,
      site_id: siteId,
      pour_id: pourId,
      supplier_id: supplierId,
      plate,
      nf_number: nf,
      volume_nf_m3: volumeNf,
      volume_returned_m3: volumeReturned,
      volume_other_dest_m3: volumeOther,
      is_demo: false,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !delivery) {
    redirect(
      `/mapas/${siteId}/concretagens/${pourId}?error=${encodeURIComponent(error?.message || "Falha")}`,
    );
  }

  if (regionId && allocVolume > 0) {
    const available =
      volumeNf - volumeReturned - volumeOther;
    if (allocVolume > available + 1e-9) {
      redirect(
        `/mapas/${siteId}/concretagens/${pourId}?error=Alocação acima do volume disponível da carga (requer justificativa/permissão especial — bloqueado no MVP)`,
      );
    }
    await supabase.from("mc_delivery_region_allocations").insert({
      organization_id: session.organizationId,
      delivery_id: delivery.id,
      region_id: regionId,
      volume_allocated_m3: allocVolume,
      volume_discharged_m3: allocVolume,
    });
  }

  revalidatePath(`/mapas/${siteId}/concretagens/${pourId}`);
  redirect(`/mapas/${siteId}/concretagens/${pourId}?ok=nf`);
}

export async function createSlumpAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const pourId = String(formData.get("pour_id") || "");
  const deliveryId = String(formData.get("delivery_id") || "");
  const measured = Number(formData.get("measured_mm") || 0);
  const spec = Number(formData.get("slump_spec_mm") || 0) || null;
  const tolerance = Number(formData.get("tolerance_mm") || 10) || 10;
  const responsible =
    String(formData.get("responsible_name") || "").trim() || null;

  if (!deliveryId || !(measured >= 0)) {
    redirect(
      `/mapas/${siteId}/concretagens/${pourId}?error=Informe o abatimento medido`,
    );
  }

  const compliant =
    spec != null ? Math.abs(measured - spec) <= tolerance : null;

  const supabase = await createClient();
  const { data: slump, error } = await supabase
    .from("mc_slump_tests")
    .insert({
      organization_id: session.organizationId,
      delivery_id: deliveryId,
      measured_mm: measured,
      slump_spec_mm: spec,
      tolerance_mm: tolerance,
      compliant,
      responsible_name: responsible,
      is_demo: false,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !slump) {
    redirect(
      `/mapas/${siteId}/concretagens/${pourId}?error=${encodeURIComponent(error?.message || "Falha")}`,
    );
  }

  const file = formData.get("photo");
  if (file instanceof File && file.size > 0) {
    const validation = validateUpload("image", file);
    if (!validation.ok) {
      redirect(
        `/mapas/${siteId}/concretagens/${pourId}?error=${encodeURIComponent(validation.message)}`,
      );
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const hash = createHash("sha256").update(buffer).digest("hex");
    const path = `${session.organizationId}/mapas/slump/${slump.id}_${hash.slice(0, 10)}.jpg`;
    await supabase.storage.from(EVIDENCE).upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
    const { data: att } = await supabase
      .from("mc_attachments")
      .insert({
        organization_id: session.organizationId,
        storage_path: path,
        file_name: file.name,
        mime_type: file.type || "image/jpeg",
        byte_size: file.size,
        content_hash: hash,
        description: "Foto Slump Test",
        created_by: session.userId,
      })
      .select("id")
      .single();
    if (att) {
      await supabase.from("mc_attachment_links").insert([
        {
          organization_id: session.organizationId,
          attachment_id: att.id,
          parent_kind: "slump",
          parent_id: slump.id,
        },
        {
          organization_id: session.organizationId,
          attachment_id: att.id,
          parent_kind: "delivery",
          parent_id: deliveryId,
        },
      ]);
    }
  }

  revalidatePath(`/mapas/${siteId}/concretagens/${pourId}`);
  redirect(`/mapas/${siteId}/concretagens/${pourId}?ok=slump`);
}
