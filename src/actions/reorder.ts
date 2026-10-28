"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { AppErrors, redirectWithError } from "@/lib/validation/errors";

async function assertDraftVersion(versionId: string, orgId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("checklist_template_versions")
    .select("status, organization_id")
    .eq("id", versionId)
    .single();
  if (
    !data ||
    data.status !== "draft" ||
    data.organization_id !== orgId
  ) {
    return null;
  }
  return data;
}

export async function reorderItemsAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const templateId = String(formData.get("template_id") || "");
  const versionId = String(formData.get("version_id") || "");
  const itemId = String(formData.get("item_id") || "");
  const direction = String(formData.get("direction") || ""); // up | down

  const draft = await assertDraftVersion(versionId, session.organizationId);
  if (!draft) {
    redirect(redirectWithError(`/templates/${templateId}`, AppErrors.IMMUTABLE_TEMPLATE));
  }

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("checklist_items")
    .select("id, section_id, sort_order")
    .eq("id", itemId)
    .single();

  if (!item) {
    redirect(redirectWithError(`/templates/${templateId}`, AppErrors.NOT_FOUND));
  }

  const { data: siblings } = await supabase
    .from("checklist_items")
    .select("id, sort_order")
    .eq("section_id", item.section_id)
    .order("sort_order");

  const list = siblings || [];
  const idx = list.findIndex((s) => s.id === itemId);
  const swapWith =
    direction === "up" ? list[idx - 1] : direction === "down" ? list[idx + 1] : null;

  if (!swapWith) {
    redirect(`/templates/${templateId}`);
  }

  await supabase
    .from("checklist_items")
    .update({ sort_order: swapWith.sort_order })
    .eq("id", item.id);
  await supabase
    .from("checklist_items")
    .update({ sort_order: item.sort_order })
    .eq("id", swapWith.id);

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "template.reorder_items",
    entityType: "checklist_items",
    entityId: itemId,
    payload: { direction, versionId },
  });

  revalidatePath(`/templates/${templateId}`);
  redirect(`/templates/${templateId}`);
}

export async function reorderSectionsAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const templateId = String(formData.get("template_id") || "");
  const versionId = String(formData.get("version_id") || "");
  const sectionId = String(formData.get("section_id") || "");
  const direction = String(formData.get("direction") || "");

  const draft = await assertDraftVersion(versionId, session.organizationId);
  if (!draft) {
    redirect(redirectWithError(`/templates/${templateId}`, AppErrors.IMMUTABLE_TEMPLATE));
  }

  const supabase = await createClient();
  const { data: section } = await supabase
    .from("checklist_sections")
    .select("id, sort_order")
    .eq("id", sectionId)
    .single();

  if (!section) {
    redirect(redirectWithError(`/templates/${templateId}`, AppErrors.NOT_FOUND));
  }

  const { data: siblings } = await supabase
    .from("checklist_sections")
    .select("id, sort_order")
    .eq("template_version_id", versionId)
    .order("sort_order");

  const list = siblings || [];
  const idx = list.findIndex((s) => s.id === sectionId);
  const swapWith =
    direction === "up" ? list[idx - 1] : direction === "down" ? list[idx + 1] : null;

  if (!swapWith) redirect(`/templates/${templateId}`);

  await supabase
    .from("checklist_sections")
    .update({ sort_order: swapWith.sort_order })
    .eq("id", section.id);
  await supabase
    .from("checklist_sections")
    .update({ sort_order: section.sort_order })
    .eq("id", swapWith.id);

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "template.reorder_sections",
    entityType: "checklist_sections",
    entityId: sectionId,
    payload: { direction },
  });

  revalidatePath(`/templates/${templateId}`);
  redirect(`/templates/${templateId}`);
}
