"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { ActivityKind, PriorityLevel } from "@/lib/types/domain";

export async function createTemplateAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const name = String(formData.get("name") || "").trim();
  const drawingTypeId = String(formData.get("drawing_type_id") || "");
  const activityKind = String(formData.get("activity_kind") || "") as ActivityKind;

  if (!name || !drawingTypeId || !activityKind) {
    redirect("/templates?error=Preencha nome, categoria e tipo de atividade");
  }

  const supabase = await createClient();
  const { data: template, error } = await supabase
    .from("checklist_templates")
    .insert({
      organization_id: session.organizationId,
      name,
      drawing_type_id: drawingTypeId,
      activity_kind: activityKind,
      status: "draft",
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/templates?error=${encodeURIComponent(error.message)}`);
  }

  const { data: version, error: vErr } = await supabase
    .from("checklist_template_versions")
    .insert({
      template_id: template.id,
      organization_id: session.organizationId,
      version_number: 1,
      status: "draft",
    })
    .select("id")
    .single();

  if (vErr) {
    redirect(`/templates?error=${encodeURIComponent(vErr.message)}`);
  }

  await supabase
    .from("checklist_templates")
    .update({ current_version_id: version.id })
    .eq("id", template.id);

  revalidatePath("/templates");
  redirect(`/templates/${template.id}`);
}

export async function addSectionAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const templateId = String(formData.get("template_id") || "");
  const versionId = String(formData.get("version_id") || "");
  const title = String(formData.get("title") || "").trim();
  if (!title) redirect(`/templates/${templateId}?error=Título da seção obrigatório`);

  const supabase = await createClient();
  const { data: version } = await supabase
    .from("checklist_template_versions")
    .select("status, organization_id")
    .eq("id", versionId)
    .single();

  if (!version || version.status !== "draft" || version.organization_id !== session.organizationId) {
    redirect(`/templates/${templateId}?error=Só é possível editar versão em rascunho`);
  }

  const { count } = await supabase
    .from("checklist_sections")
    .select("*", { count: "exact", head: true })
    .eq("template_version_id", versionId);

  await supabase.from("checklist_sections").insert({
    template_version_id: versionId,
    title,
    sort_order: (count || 0) + 1,
  });

  revalidatePath(`/templates/${templateId}`);
  redirect(`/templates/${templateId}`);
}

export async function addItemAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const templateId = String(formData.get("template_id") || "");
  const versionId = String(formData.get("version_id") || "");
  const sectionId = String(formData.get("section_id") || "");
  const code = String(formData.get("code") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const objective = String(formData.get("objective") || "").trim() || null;
  const stepsRaw = String(formData.get("steps") || "").trim();
  const verifiableParameter =
    String(formData.get("verifiable_parameter") || "").trim() || null;
  const acceptanceCriteria =
    String(formData.get("acceptance_criteria") || "").trim() || null;
  const technicalReferenceRaw =
    String(formData.get("technical_reference") || "").trim();
  const priority = (String(formData.get("priority") || "media") ||
    "media") as PriorityLevel;
  const isBlocking = formData.get("is_blocking") === "on";
  const instructions =
    String(formData.get("instructions") || "").trim() || null;
  const mediaUrl = String(formData.get("media_url") || "").trim() || null;
  const mediaCaption =
    String(formData.get("media_caption") || "").trim() || null;
  const videoUrl = String(formData.get("video_url") || "").trim() || null;

  if (!code || !title || !sectionId) {
    redirect(`/templates/${templateId}?error=Código, título e seção são obrigatórios`);
  }

  const supabase = await createClient();
  const { data: version } = await supabase
    .from("checklist_template_versions")
    .select("status, organization_id")
    .eq("id", versionId)
    .single();
  if (
    !version ||
    version.status !== "draft" ||
    version.organization_id !== session.organizationId
  ) {
    redirect(`/templates/${templateId}?error=Versão não editável`);
  }

  const steps = stepsRaw
    ? stepsRaw.split("\n").map((s) => s.trim()).filter(Boolean)
    : [];

  let technical_reference = null;
  if (technicalReferenceRaw) {
    technical_reference = {
      note: technicalReferenceRaw,
      norm: null,
      edition: null,
      item: null,
    };
  }

  const { count } = await supabase
    .from("checklist_items")
    .select("*", { count: "exact", head: true })
    .eq("section_id", sectionId);

  const { data: item, error } = await supabase
    .from("checklist_items")
    .insert({
      template_version_id: versionId,
      section_id: sectionId,
      code,
      title,
      objective,
      steps,
      verifiable_parameter: verifiableParameter,
      acceptance_criteria: acceptanceCriteria,
      technical_reference,
      priority,
      is_blocking: isBlocking,
      instructions,
      sort_order: (count || 0) + 1,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/templates/${templateId}?error=${encodeURIComponent(error.message)}`);
  }

  if (mediaUrl) {
    await supabase.from("checklist_item_media").insert({
      item_id: item.id,
      kind: "highlight",
      external_url: mediaUrl,
      caption: mediaCaption,
      sort_order: 1,
    });
  }
  if (videoUrl) {
    await supabase.from("checklist_item_media").insert({
      item_id: item.id,
      kind: "video",
      external_url: videoUrl,
      caption: "Vídeo demonstrativo",
      sort_order: 2,
    });
  }

  revalidatePath(`/templates/${templateId}`);
  redirect(`/templates/${templateId}`);
}

export async function publishTemplateVersionAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const templateId = String(formData.get("template_id") || "");
  const versionId = String(formData.get("version_id") || "");
  const note = String(formData.get("snapshot_note") || "").trim() || null;

  const supabase = await createClient();

  await supabase
    .from("checklist_template_versions")
    .update({ status: "superseded" })
    .eq("template_id", templateId)
    .eq("status", "published");

  const { error } = await supabase
    .from("checklist_template_versions")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_by: session.userId,
      snapshot_note: note,
    })
    .eq("id", versionId)
    .eq("status", "draft");

  if (error) {
    redirect(`/templates/${templateId}?error=${encodeURIComponent(error.message)}`);
  }

  await supabase
    .from("checklist_templates")
    .update({
      status: "published",
      current_version_id: versionId,
    })
    .eq("id", templateId);

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "template.publish",
    entity_type: "checklist_templates",
    entity_id: templateId,
    payload: { version_id: versionId },
  });

  revalidatePath(`/templates/${templateId}`);
  redirect(`/templates/${templateId}?ok=Versão publicada`);
}

/** Nova versão draft a partir da publicada — não altera runs antigos. */
export async function createNewTemplateVersionAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const templateId = String(formData.get("template_id") || "");
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("current_version_id, organization_id")
    .eq("id", templateId)
    .single();

  if (!template?.current_version_id) {
    redirect(`/templates/${templateId}?error=Template sem versão`);
  }

  const { data: versions } = await supabase
    .from("checklist_template_versions")
    .select("version_number")
    .eq("template_id", templateId)
    .order("version_number", { ascending: false })
    .limit(1);

  const nextNum = (versions?.[0]?.version_number || 0) + 1;
  const sourceId = template.current_version_id;

  const { data: newVersion, error } = await supabase
    .from("checklist_template_versions")
    .insert({
      template_id: templateId,
      organization_id: session.organizationId,
      version_number: nextNum,
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/templates/${templateId}?error=${encodeURIComponent(error.message)}`);
  }

  const { data: sections } = await supabase
    .from("checklist_sections")
    .select("*")
    .eq("template_version_id", sourceId)
    .order("sort_order");

  for (const section of sections || []) {
    const { data: newSection } = await supabase
      .from("checklist_sections")
      .insert({
        template_version_id: newVersion.id,
        title: section.title,
        sort_order: section.sort_order,
      })
      .select("id")
      .single();

    if (!newSection) continue;

    const { data: items } = await supabase
      .from("checklist_items")
      .select("*, checklist_item_media(*)")
      .eq("section_id", section.id)
      .order("sort_order");

    for (const item of items || []) {
      const { data: newItem } = await supabase
        .from("checklist_items")
        .insert({
          template_version_id: newVersion.id,
          section_id: newSection.id,
          code: item.code,
          title: item.title,
          objective: item.objective,
          steps: item.steps,
          verifiable_parameter: item.verifiable_parameter,
          acceptance_criteria: item.acceptance_criteria,
          technical_reference: item.technical_reference,
          priority: item.priority,
          is_blocking: item.is_blocking,
          instructions: item.instructions,
          conditional_rules: item.conditional_rules,
          sort_order: item.sort_order,
        })
        .select("id")
        .single();

      const media = item.checklist_item_media || [];
      if (newItem && media.length) {
        await supabase.from("checklist_item_media").insert(
          media.map(
            (m: {
              kind: string;
              storage_path: string | null;
              external_url: string | null;
              caption: string | null;
              cover_path: string | null;
              duration_seconds: number | null;
              sort_order: number;
            }) => ({
              item_id: newItem.id,
              kind: m.kind,
              storage_path: m.storage_path,
              external_url: m.external_url,
              caption: m.caption,
              cover_path: m.cover_path,
              duration_seconds: m.duration_seconds,
              sort_order: m.sort_order,
            }),
          ),
        );
      }
    }
  }

  await supabase
    .from("checklist_templates")
    .update({ current_version_id: newVersion.id, status: "draft" })
    .eq("id", templateId);

  revalidatePath(`/templates/${templateId}`);
  redirect(`/templates/${templateId}?ok=Nova versão ${nextNum} em rascunho`);
}
