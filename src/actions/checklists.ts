"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { validateResponseComment } from "@/lib/workflow";
import type { ActivityKind, ResponseStatus } from "@/lib/types/domain";

export async function startChecklistRunAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const revisionId = String(formData.get("revision_id") || "");
  const activityKind = String(formData.get("activity_kind") || "") as ActivityKind;
  const templateId = String(formData.get("template_id") || "");

  const supabase = await createClient();

  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select("*, drawings(drawing_type_id, project_id)")
    .eq("id", revisionId)
    .single();

  if (!revision || revision.immutable) {
    redirect(`/revisions/${revisionId}?error=Revisão indisponível`);
  }

  let versionId: string | null = null;
  let templateMeta: { id: string; name: string; version_number: number } | null =
    null;

  if (templateId) {
    const { data: t } = await supabase
      .from("checklist_templates")
      .select("id, name, current_version_id, checklist_template_versions!checklist_templates_current_version_id_fkey(id, version_number, status)")
      .eq("id", templateId)
      .single();
    const ver = t?.checklist_template_versions as
      | { id: string; version_number: number; status: string }
      | { id: string; version_number: number; status: string }[]
      | null;
    const v = Array.isArray(ver) ? ver[0] : ver;
    if (t && v && v.status === "published") {
      versionId = v.id;
      templateMeta = {
        id: t.id,
        name: t.name,
        version_number: v.version_number,
      };
    }
  }

  if (!versionId) {
    const drawing = revision.drawings as
      | { drawing_type_id: string }
      | { drawing_type_id: string }[]
      | null;
    const typeId = Array.isArray(drawing)
      ? drawing[0]?.drawing_type_id
      : drawing?.drawing_type_id;

    const { data: templates } = await supabase
      .from("checklist_templates")
      .select(
        "id, name, current_version_id, checklist_template_versions!inner(id, version_number, status)",
      )
      .eq("organization_id", session.organizationId)
      .eq("drawing_type_id", typeId)
      .eq("activity_kind", activityKind)
      .eq("status", "published");

    const published = (templates || []).find((t) => {
      const ver = t.checklist_template_versions as
        | { id: string; version_number: number; status: string }
        | { id: string; version_number: number; status: string }[];
      const v = Array.isArray(ver) ? ver[0] : ver;
      return v?.status === "published";
    });

    if (!published) {
      redirect(
        `/revisions/${revisionId}?error=Nenhum template publicado para esta categoria/atividade`,
      );
    }
    const ver = published.checklist_template_versions as
      | { id: string; version_number: number; status: string }
      | { id: string; version_number: number; status: string }[];
    const v = Array.isArray(ver) ? ver[0] : ver;
    versionId = v.id;
    templateMeta = {
      id: published.id,
      name: published.name,
      version_number: v.version_number,
    };
  }

  const { data: sections } = await supabase
    .from("checklist_sections")
    .select("*, checklist_items(*, checklist_item_media(*))")
    .eq("template_version_id", versionId)
    .order("sort_order");

  const snapshot = {
    template: templateMeta,
    template_version_id: versionId,
    frozen_at: new Date().toISOString(),
    sections: (sections || []).map((s) => ({
      id: s.id,
      title: s.title,
      sort_order: s.sort_order,
      items: (s.checklist_items || []).map(
        (i: Record<string, unknown>) => ({
          id: i.id,
          code: i.code,
          title: i.title,
          objective: i.objective,
          steps: i.steps,
          verifiable_parameter: i.verifiable_parameter,
          acceptance_criteria: i.acceptance_criteria,
          technical_reference: i.technical_reference,
          priority: i.priority,
          is_blocking: i.is_blocking,
          instructions: i.instructions,
          media: i.checklist_item_media,
        }),
      ),
    })),
  };

  const workflow =
    activityKind === "producao" ? "em_producao" : "em_conferencia";

  const { data: run, error } = await supabase
    .from("checklist_runs")
    .insert({
      organization_id: session.organizationId,
      revision_id: revisionId,
      template_version_id: versionId,
      activity_kind: activityKind,
      status: "em_andamento",
      assignee_id: session.userId,
      template_snapshot: snapshot,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/revisions/${revisionId}?error=${encodeURIComponent(error.message)}`);
  }

  const runItems: Array<Record<string, unknown>> = [];
  let order = 0;
  for (const section of sections || []) {
    for (const item of section.checklist_items || []) {
      order += 1;
      runItems.push({
        run_id: run.id,
        source_item_id: item.id,
        section_title: section.title,
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
        media_snapshot: item.checklist_item_media || [],
        sort_order: order,
      });
    }
  }

  if (runItems.length) {
    const { data: inserted } = await supabase
      .from("checklist_run_items")
      .insert(runItems)
      .select("id");

    if (inserted?.length) {
      await supabase.from("checklist_item_responses").insert(
        inserted.map((ri) => ({
          run_item_id: ri.id,
          organization_id: session.organizationId,
          status: "nao_iniciado",
        })),
      );
    }
  }

  await supabase
    .from("drawing_revisions")
    .update({ workflow_status: workflow })
    .eq("id", revisionId)
    .eq("immutable", false);

  revalidatePath(`/revisions/${revisionId}`);
  redirect(`/revisions/${revisionId}/checklist/${run.id}`);
}

export async function saveResponseAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const runId = String(formData.get("run_id") || "");
  const revisionId = String(formData.get("revision_id") || "");
  const responseId = String(formData.get("response_id") || "");
  const runItemId = String(formData.get("run_item_id") || "");
  const status = String(formData.get("status") || "") as ResponseStatus;
  const comment = String(formData.get("comment") || "");

  const validation = validateResponseComment(status, comment);
  if (validation) {
    redirect(
      `/revisions/${revisionId}/checklist/${runId}?item=${runItemId}&error=${encodeURIComponent(validation)}`,
    );
  }

  const supabase = await createClient();

  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select("immutable")
    .eq("id", revisionId)
    .single();
  if (revision?.immutable) {
    redirect(`/revisions/${revisionId}/checklist/${runId}?error=Revisão imutável`);
  }

  const { error } = await supabase
    .from("checklist_item_responses")
    .update({
      status,
      comment: comment.trim() || null,
      answered_by: session.userId,
      answered_at: new Date().toISOString(),
    })
    .eq("id", responseId);

  if (error) {
    redirect(
      `/revisions/${revisionId}/checklist/${runId}?item=${runItemId}&error=${encodeURIComponent(error.message)}`,
    );
  }

  // NC → criar issue automaticamente
  if (status === "nao_conforme") {
    const { data: existing } = await supabase
      .from("issues")
      .select("id")
      .eq("response_id", responseId)
      .neq("status", "resolvida")
      .maybeSingle();

    if (!existing) {
      const { data: runItem } = await supabase
        .from("checklist_run_items")
        .select("code, title, priority")
        .eq("id", runItemId)
        .single();

      const { data: rev } = await supabase
        .from("drawing_revisions")
        .select("production_owner_id, drawings(project_id)")
        .eq("id", revisionId)
        .single();

      const drawings = rev?.drawings as
        | { project_id: string }
        | { project_id: string }[]
        | null;
      const projectId = Array.isArray(drawings)
        ? drawings[0]?.project_id
        : drawings?.project_id;

      const { data: codeData } = await supabase.rpc("next_issue_code", {
        p_org: session.organizationId,
      });

      const { data: issue } = await supabase
        .from("issues")
        .insert({
          organization_id: session.organizationId,
          code: codeData || `NC-${Date.now()}`,
          title: `${runItem?.code || ""} — ${runItem?.title || "Não conformidade"}`,
          description: comment,
          run_item_id: runItemId,
          response_id: responseId,
          revision_id: revisionId,
          project_id: projectId,
          priority: runItem?.priority || "media",
          assignee_id: rev?.production_owner_id || null,
          status: "aberta",
          opened_by: session.userId,
        })
        .select("id")
        .single();

      if (issue) {
        await supabase.from("issue_events").insert({
          issue_id: issue.id,
          event_type: "opened",
          payload: { from_response: responseId, comment },
          actor_id: session.userId,
        });
      }
    }
  }

  revalidatePath(`/revisions/${revisionId}/checklist/${runId}`);
  redirect(`/revisions/${revisionId}/checklist/${runId}?item=${runItemId}&ok=1`);
}

export async function submitProductionAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const revisionId = String(formData.get("revision_id") || "");
  const runId = String(formData.get("run_id") || "");
  const supabase = await createClient();

  await supabase
    .from("checklist_runs")
    .update({
      status: "concluido",
      completed_at: new Date().toISOString(),
    })
    .eq("id", runId);

  await supabase
    .from("drawing_revisions")
    .update({ workflow_status: "aguardando_conferencia" })
    .eq("id", revisionId)
    .eq("immutable", false);

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "production.submit",
    entity_type: "checklist_runs",
    entity_id: runId,
    payload: { revision_id: revisionId },
  });

  revalidatePath(`/revisions/${revisionId}`);
  redirect(`/revisions/${revisionId}?ok=Encaminhado para conferência`);
}

export async function uploadEvidenceAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const responseId = String(formData.get("response_id") || "");
  const revisionId = String(formData.get("revision_id") || "");
  const runId = String(formData.get("run_id") || "");
  const runItemId = String(formData.get("run_item_id") || "");
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    redirect(
      `/revisions/${revisionId}/checklist/${runId}?item=${runItemId}&error=Selecione um arquivo`,
    );
  }

  const allowed = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
  ];
  if (!allowed.includes(file.type)) {
    redirect(
      `/revisions/${revisionId}/checklist/${runId}?item=${runItemId}&error=Formato não permitido`,
    );
  }
  if (file.size > 20 * 1024 * 1024) {
    redirect(
      `/revisions/${revisionId}/checklist/${runId}?item=${runItemId}&error=Arquivo maior que 20MB`,
    );
  }

  const supabase = await createClient();
  const bucket = process.env.STORAGE_BUCKET_EVIDENCE || "evidence";
  const path = `${session.organizationId}/evidence/${responseId}/${Date.now()}-${file.name}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (upErr) {
    redirect(
      `/revisions/${revisionId}/checklist/${runId}?item=${runItemId}&error=${encodeURIComponent(upErr.message)}`,
    );
  }

  await supabase.from("response_evidence").insert({
    response_id: responseId,
    organization_id: session.organizationId,
    storage_path: path,
    file_name: file.name,
    mime_type: file.type,
    size_bytes: file.size,
    uploaded_by: session.userId,
  });

  revalidatePath(`/revisions/${revisionId}/checklist/${runId}`);
  redirect(`/revisions/${revisionId}/checklist/${runId}?item=${runItemId}&ok=Evidência anexada`);
}
