"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import type { GeoJsonPolygon } from "@/lib/mapas/geometry";
import { computeRegionElementIntersection } from "@/lib/mapas/quantities";
import type { McElementKind } from "@/lib/mapas/types";

function reconcilePath(siteId: string, drawingId: string, qs?: string) {
  const base = `/mapas/${siteId}/planta/${drawingId}/reconciliar`;
  return qs ? `${base}?${qs}` : base;
}

async function loadPair(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
  targetId: string,
) {
  const { data: target } = await supabase
    .from("mc_drawing_revisions")
    .select("*")
    .eq("id", targetId)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!target?.supersedes_revision_id) return null;
  const { data: source } = await supabase
    .from("mc_drawing_revisions")
    .select("*")
    .eq("id", target.supersedes_revision_id)
    .eq("organization_id", orgId)
    .maybeSingle();
  if (!source) return null;
  return { target, source };
}

async function recomputeIntersections(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  orgId: string;
  siteId: string;
  regionId: string;
  geometry: GeoJsonPolygon;
  areaM2: number;
}) {
  const { data: elements } = await args.supabase
    .from("mc_structural_elements")
    .select(
      "id, kind, geometry, area_m2, thickness_m, height_m, volume_teorico_m3, section_area_m2, axis_length_m, executed_length_m",
    )
    .eq("site_id", args.siteId)
    .eq("organization_id", args.orgId);

  for (const el of elements || []) {
    const result = computeRegionElementIntersection(
      {
        id: args.regionId,
        geometry: args.geometry,
        area_m2: args.areaM2,
      },
      {
        id: el.id,
        kind: el.kind as McElementKind,
        geometry: el.geometry as GeoJsonPolygon | null,
        area_m2: el.area_m2 != null ? Number(el.area_m2) : null,
        thickness_m: el.thickness_m != null ? Number(el.thickness_m) : null,
        height_m: el.height_m != null ? Number(el.height_m) : null,
        volume_teorico_m3:
          el.volume_teorico_m3 != null ? Number(el.volume_teorico_m3) : null,
        section_area_m2:
          el.section_area_m2 != null ? Number(el.section_area_m2) : null,
        axis_length_m:
          el.axis_length_m != null ? Number(el.axis_length_m) : null,
        executed_length_m:
          el.executed_length_m != null ? Number(el.executed_length_m) : null,
      },
    );
    await args.supabase.from("mc_region_element_intersections").upsert(
      {
        organization_id: args.orgId,
        region_id: args.regionId,
        element_id: el.id,
        intersection_area_m2: result.intersectionAreaM2,
        percent: result.percent,
        volume_estimado_m3: result.volumeEstimadoM3,
        method: result.method,
        data_origin: result.dataOrigin,
        precision_note: result.precisionNote,
        warnings: result.warnings,
        indeterminate: result.indeterminate,
        calc_memory: result.calcMemory || null,
        containment: result.containment || null,
      },
      { onConflict: "region_id,element_id" },
    );
  }
}

/** Explicit copy of a source mapping onto the target revision (never silent). */
export async function reconcileCopyToTargetAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador", "desenhista"]);
  const siteId = String(formData.get("site_id") || "");
  const targetId = String(formData.get("target_revision_id") || "");
  const sourceRegionId = String(formData.get("source_region_id") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  const proposalStatus = String(formData.get("proposal_status") || "") || null;

  const supabase = await createClient();
  const pair = await loadPair(supabase, session.organizationId, targetId);
  if (!pair) {
    redirect(reconcilePath(siteId, targetId, "error=Par+de+revisões+inválido"));
  }

  const { data: sourceRegion } = await supabase
    .from("mc_mapped_regions")
    .select("*")
    .eq("id", sourceRegionId)
    .eq("drawing_revision_id", pair.source.id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!sourceRegion || sourceRegion.archived_at) {
    redirect(
      reconcilePath(
        siteId,
        targetId,
        "error=Região+origem+não+encontrada+ou+já+arquivada",
      ),
    );
  }

  const { data: existing } = await supabase
    .from("mc_mapped_regions")
    .select("id")
    .eq("drawing_revision_id", targetId)
    .eq("copied_from_region_id", sourceRegionId)
    .is("archived_at", null)
    .maybeSingle();

  if (existing) {
    redirect(
      reconcilePath(
        siteId,
        targetId,
        "error=Esta+região+já+foi+copiada+para+a+nova+revisão",
      ),
    );
  }

  const { data: copied, error } = await supabase
    .from("mc_mapped_regions")
    .insert({
      site_id: siteId,
      drawing_revision_id: targetId,
      organization_id: session.organizationId,
      name: sourceRegion.name,
      tool: sourceRegion.tool,
      geometry: sourceRegion.geometry,
      area_m2: sourceRegion.area_m2,
      color: sourceRegion.color,
      notes:
        notes ||
        `Copiado explicitamente da revisão ${pair.source.revision_code}`,
      is_demo: sourceRegion.is_demo,
      created_by: session.userId,
      copied_from_region_id: sourceRegionId,
    })
    .select("id")
    .single();

  if (error || !copied) {
    redirect(
      reconcilePath(
        siteId,
        targetId,
        `error=${encodeURIComponent(error?.message || "Falha ao copiar")}`,
      ),
    );
  }

  await recomputeIntersections({
    supabase,
    orgId: session.organizationId,
    siteId,
    regionId: copied.id,
    geometry: sourceRegion.geometry as GeoJsonPolygon,
    areaM2: Number(sourceRegion.area_m2 || 0),
  });

  await supabase.from("mc_region_reconciliations").insert({
    organization_id: session.organizationId,
    source_revision_id: pair.source.id,
    target_revision_id: targetId,
    source_region_id: sourceRegionId,
    target_region_id: copied.id,
    decision: "copy_to_target",
    proposal_status: proposalStatus,
    notes,
    payload: {
      sourceName: sourceRegion.name,
      area_m2: sourceRegion.area_m2,
    },
    decided_by: session.userId,
  });

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "mc.reconcile.copy",
    entityType: "mc_mapped_regions",
    entityId: copied.id,
    payload: {
      fromRegionId: sourceRegionId,
      sourceRevisionId: pair.source.id,
      targetRevisionId: targetId,
    },
  });

  revalidatePath(`/mapas/${siteId}/planta/${targetId}`);
  revalidatePath(reconcilePath(siteId, targetId));
  redirect(reconcilePath(siteId, targetId, "ok=copiado"));
}

/** Link an existing target region to a source mapping (audit only + optional note). */
export async function reconcileReassociateAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador", "desenhista"]);
  const siteId = String(formData.get("site_id") || "");
  const targetId = String(formData.get("target_revision_id") || "");
  const sourceRegionId = String(formData.get("source_region_id") || "");
  const targetRegionId = String(formData.get("target_region_id") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  const proposalStatus = String(formData.get("proposal_status") || "") || null;

  if (!sourceRegionId || !targetRegionId) {
    redirect(
      reconcilePath(siteId, targetId, "error=Selecione+origem+e+alvo"),
    );
  }

  const supabase = await createClient();
  const pair = await loadPair(supabase, session.organizationId, targetId);
  if (!pair) {
    redirect(reconcilePath(siteId, targetId, "error=Par+de+revisões+inválido"));
  }

  const { data: sourceRegion } = await supabase
    .from("mc_mapped_regions")
    .select("id, name")
    .eq("id", sourceRegionId)
    .eq("drawing_revision_id", pair.source.id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  const { data: targetRegion } = await supabase
    .from("mc_mapped_regions")
    .select("id, name, notes")
    .eq("id", targetRegionId)
    .eq("drawing_revision_id", targetId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!sourceRegion || !targetRegion) {
    redirect(reconcilePath(siteId, targetId, "error=Regiões+inválidas"));
  }

  await supabase
    .from("mc_mapped_regions")
    .update({
      copied_from_region_id: sourceRegionId,
      notes: [
        targetRegion.notes,
        notes ||
          `Reassociado explicitamente a «${sourceRegion.name}» (${pair.source.revision_code})`,
      ]
        .filter(Boolean)
        .join(" · "),
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetRegionId)
    .eq("organization_id", session.organizationId);

  await supabase.from("mc_region_reconciliations").insert({
    organization_id: session.organizationId,
    source_revision_id: pair.source.id,
    target_revision_id: targetId,
    source_region_id: sourceRegionId,
    target_region_id: targetRegionId,
    decision: "reassociate",
    proposal_status: proposalStatus,
    notes,
    payload: {
      sourceName: sourceRegion.name,
      targetName: targetRegion.name,
    },
    decided_by: session.userId,
  });

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "mc.reconcile.reassociate",
    entityType: "mc_mapped_regions",
    entityId: targetRegionId,
    payload: {
      sourceRegionId,
      sourceRevisionId: pair.source.id,
      targetRevisionId: targetId,
    },
  });

  revalidatePath(`/mapas/${siteId}/planta/${targetId}`);
  revalidatePath(reconcilePath(siteId, targetId));
  redirect(reconcilePath(siteId, targetId, "ok=reassociado"));
}

/** Archive a source mapping for this revision pair (does not delete). */
export async function reconcileArchiveAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const siteId = String(formData.get("site_id") || "");
  const targetId = String(formData.get("target_revision_id") || "");
  const sourceRegionId = String(formData.get("source_region_id") || "");
  const notes =
    String(formData.get("notes") || "").trim() ||
    "Arquivado na reconciliação de revisão";
  const proposalStatus = String(formData.get("proposal_status") || "") || null;

  const supabase = await createClient();
  const pair = await loadPair(supabase, session.organizationId, targetId);
  if (!pair) {
    redirect(reconcilePath(siteId, targetId, "error=Par+de+revisões+inválido"));
  }

  const { data: sourceRegion } = await supabase
    .from("mc_mapped_regions")
    .select("id, name")
    .eq("id", sourceRegionId)
    .eq("drawing_revision_id", pair.source.id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!sourceRegion) {
    redirect(reconcilePath(siteId, targetId, "error=Região+não+encontrada"));
  }

  await supabase
    .from("mc_mapped_regions")
    .update({
      archived_at: new Date().toISOString(),
      archived_reason: notes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sourceRegionId)
    .eq("organization_id", session.organizationId);

  await supabase.from("mc_region_reconciliations").insert({
    organization_id: session.organizationId,
    source_revision_id: pair.source.id,
    target_revision_id: targetId,
    source_region_id: sourceRegionId,
    target_region_id: null,
    decision: "archive",
    proposal_status: proposalStatus,
    notes,
    payload: { sourceName: sourceRegion.name },
    decided_by: session.userId,
  });

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "mc.reconcile.archive",
    entityType: "mc_mapped_regions",
    entityId: sourceRegionId,
    payload: {
      sourceRevisionId: pair.source.id,
      targetRevisionId: targetId,
      reason: notes,
    },
  });

  revalidatePath(`/mapas/${siteId}/planta/${targetId}`);
  revalidatePath(`/mapas/${siteId}/planta/${pair.source.id}`);
  revalidatePath(reconcilePath(siteId, targetId));
  redirect(reconcilePath(siteId, targetId, "ok=arquivado"));
}
