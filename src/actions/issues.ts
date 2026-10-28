"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { IssueStatus } from "@/lib/types/domain";

export async function updateIssueStatusAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const issueId = String(formData.get("issue_id") || "");
  const to = String(formData.get("to_status") || "") as IssueStatus;
  const comment = String(formData.get("comment") || "").trim();
  const supabase = await createClient();

  const { data: issue } = await supabase
    .from("issues")
    .select("*")
    .eq("id", issueId)
    .single();

  if (!issue) redirect("/issues?error=Pendência não encontrada");

  const patch: Record<string, unknown> = { status: to };
  if (to === "resolvida") {
    patch.resolved_at = new Date().toISOString();
    patch.resolved_by = session.userId;
  }

  await supabase.from("issues").update(patch).eq("id", issueId);
  await supabase.from("issue_events").insert({
    issue_id: issueId,
    event_type: "status_change",
    payload: { from: issue.status, to, comment },
    actor_id: session.userId,
  });

  // Sync revision workflow for common transitions
  if (to === "em_correcao") {
    await supabase
      .from("drawing_revisions")
      .update({ workflow_status: "em_correcao" })
      .eq("id", issue.revision_id)
      .eq("immutable", false);
  }
  if (to === "aguardando_reconferencia") {
    await supabase
      .from("drawing_revisions")
      .update({ workflow_status: "aguardando_reconferencia" })
      .eq("id", issue.revision_id)
      .eq("immutable", false);
  }

  revalidatePath(`/issues/${issueId}`);
  revalidatePath("/issues");
  redirect(`/issues/${issueId}?ok=Status atualizado`);
}

export async function addIssueCommentAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const issueId = String(formData.get("issue_id") || "");
  const comment = String(formData.get("comment") || "").trim();
  if (!comment) redirect(`/issues/${issueId}?error=Comentário vazio`);

  const supabase = await createClient();
  await supabase.from("issue_events").insert({
    issue_id: issueId,
    event_type: "comment",
    payload: { comment },
    actor_id: session.userId,
  });

  revalidatePath(`/issues/${issueId}`);
  redirect(`/issues/${issueId}`);
}

export async function returnWithPendenciasAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "conferente",
  ]);
  const revisionId = String(formData.get("revision_id") || "");
  const supabase = await createClient();

  await supabase
    .from("drawing_revisions")
    .update({ workflow_status: "com_pendencias" })
    .eq("id", revisionId)
    .eq("immutable", false);

  await supabase
    .from("issues")
    .update({ status: "aberta" })
    .eq("revision_id", revisionId)
    .in("status", ["aberta", "reaberta"]);

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "revision.return_pendencias",
    entity_type: "drawing_revisions",
    entity_id: revisionId,
    payload: {},
  });

  revalidatePath(`/revisions/${revisionId}`);
  redirect(`/revisions/${revisionId}?ok=Devolvido com pendências`);
}
