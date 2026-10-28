"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, canManageTemplates } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canTransition } from "@/lib/workflow";
import type { WorkflowStatus } from "@/lib/types/domain";

export async function createProjectAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const code = String(formData.get("code") || "").trim();
  const name = String(formData.get("name") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;

  if (!code || !name) {
    redirect("/projects/new?error=Código e nome são obrigatórios");
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      organization_id: session.organizationId,
      code,
      name,
      description,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/projects/new?error=${encodeURIComponent(error.message)}`);
  }

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "project.create",
    entity_type: "projects",
    entity_id: data.id,
    payload: { code, name },
  });

  revalidatePath("/projects");
  redirect(`/projects/${data.id}`);
}

export async function createDrawingAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
  ]);
  const projectId = String(formData.get("project_id") || "");
  const drawingTypeId = String(formData.get("drawing_type_id") || "");
  const number = String(formData.get("number") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const levelLabel = String(formData.get("level_label") || "").trim() || null;
  const revisionCode =
    String(formData.get("revision_code") || "R00").trim() || "R00";

  if (!projectId || !drawingTypeId || !number || !title) {
    redirect(`/projects/${projectId}?error=Preencha os campos da prancha`);
  }

  const supabase = await createClient();
  const { data: drawing, error } = await supabase
    .from("drawings")
    .insert({
      organization_id: session.organizationId,
      project_id: projectId,
      drawing_type_id: drawingTypeId,
      number,
      title,
      level_label: levelLabel,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error) {
    redirect(
      `/projects/${projectId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  const { data: revision, error: revError } = await supabase
    .from("drawing_revisions")
    .insert({
      drawing_id: drawing.id,
      organization_id: session.organizationId,
      revision_code: revisionCode,
      workflow_status: "rascunho",
      production_owner_id: session.userId,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (revError) {
    redirect(
      `/projects/${projectId}?error=${encodeURIComponent(revError.message)}`,
    );
  }

  revalidatePath(`/projects/${projectId}`);
  redirect(`/revisions/${revision.id}`);
}

export async function updateRevisionWorkflowAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const revisionId = String(formData.get("revision_id") || "");
  const to = String(formData.get("to_status") || "") as WorkflowStatus;
  const supabase = await createClient();

  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select("*")
    .eq("id", revisionId)
    .single();

  if (!revision || revision.immutable) {
    redirect(`/revisions/${revisionId}?error=Revisão imutável ou inexistente`);
  }

  if (!canTransition(revision.workflow_status as WorkflowStatus, to)) {
    redirect(
      `/revisions/${revisionId}?error=Transição de status não permitida`,
    );
  }

  if (
    to === "aprovado_emissao" &&
    !canManageTemplates(session.role) &&
    session.role !== "conferente"
  ) {
    redirect(`/revisions/${revisionId}?error=Sem permissão para aprovar`);
  }

  const { error } = await supabase
    .from("drawing_revisions")
    .update({ workflow_status: to })
    .eq("id", revisionId);

  if (error) {
    redirect(
      `/revisions/${revisionId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "revision.workflow",
    entity_type: "drawing_revisions",
    entity_id: revisionId,
    payload: { from: revision.workflow_status, to },
  });

  revalidatePath(`/revisions/${revisionId}`);
  redirect(`/revisions/${revisionId}`);
}

export async function assignRevisionOwnersAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const revisionId = String(formData.get("revision_id") || "");
  const productionOwnerId =
    String(formData.get("production_owner_id") || "") || null;
  const reviewerId = String(formData.get("reviewer_id") || "") || null;

  const supabase = await createClient();
  const { error } = await supabase
    .from("drawing_revisions")
    .update({
      production_owner_id: productionOwnerId,
      reviewer_id: reviewerId,
    })
    .eq("id", revisionId)
    .eq("organization_id", session.organizationId)
    .eq("immutable", false);

  if (error) {
    redirect(
      `/revisions/${revisionId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  revalidatePath(`/revisions/${revisionId}`);
  redirect(`/revisions/${revisionId}`);
}
