"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, canApprove } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { findBlockingProblems } from "@/lib/workflow";
import type { ResponseStatus } from "@/lib/types/domain";

export async function approveRevisionAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "conferente",
  ]);
  if (!canApprove(session.role)) {
    redirect("/dashboard?sem_permissao=1");
  }

  const revisionId = String(formData.get("revision_id") || "");
  const notes = String(formData.get("notes") || "").trim() || null;
  const exceptionNote = String(formData.get("exception_note") || "").trim();
  const supabase = await createClient();

  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select("*")
    .eq("id", revisionId)
    .single();

  if (!revision || revision.immutable) {
    redirect(`/revisions/${revisionId}?error=Revisão indisponível`);
  }

  if (revision.production_owner_id === session.userId) {
    redirect(
      `/revisions/${revisionId}?error=Não é permitido aprovar a própria prancha (autor de produção)`,
    );
  }

  const { data: runs } = await supabase
    .from("checklist_runs")
    .select("id, activity_kind")
    .eq("revision_id", revisionId)
    .eq("activity_kind", "conferencia")
    .order("created_at", { ascending: false })
    .limit(1);

  const confRun = runs?.[0];
  if (confRun) {
    const { data: items } = await supabase
      .from("checklist_run_items")
      .select(
        "id, code, title, is_blocking, priority, checklist_item_responses(status)",
      )
      .eq("run_id", confRun.id);

    const flattened =
      items?.map((i) => {
        const resp = i.checklist_item_responses as
          | { status: ResponseStatus }
          | { status: ResponseStatus }[]
          | null;
        const status = Array.isArray(resp)
          ? resp[0]?.status
          : resp?.status;
        return {
          id: i.id,
          code: i.code,
          title: i.title,
          is_blocking: i.is_blocking,
          priority: i.priority,
          status: (status || "nao_iniciado") as ResponseStatus,
        };
      }) || [];

    const blockers = findBlockingProblems(flattened);
    if (blockers.length && !exceptionNote) {
      redirect(
        `/revisions/${revisionId}?error=Há itens críticos/bloqueantes pendentes. Registre exceção formal ou resolva-os.`,
      );
    }
  }

  const { data: openIssues } = await supabase
    .from("issues")
    .select("id")
    .eq("revision_id", revisionId)
    .not("status", "eq", "resolvida");

  if ((openIssues?.length || 0) > 0 && !exceptionNote) {
    redirect(
      `/revisions/${revisionId}?error=Há pendências abertas. Resolva-as ou registre exceção formal.`,
    );
  }

  const exception_records = exceptionNote
    ? [
        {
          note: exceptionNote,
          by: session.userId,
          at: new Date().toISOString(),
          disclaimer:
            "Exceção formal registrada; não transforma erro técnico em conformidade.",
        },
      ]
    : [];

  const { error: apprErr } = await supabase.from("approvals").insert({
    organization_id: session.organizationId,
    revision_id: revisionId,
    decision: "aprovado_emissao",
    decided_by: session.userId,
    notes,
    exception_records,
  });

  if (apprErr) {
    redirect(
      `/revisions/${revisionId}?error=${encodeURIComponent(apprErr.message)}`,
    );
  }

  const { error } = await supabase
    .from("drawing_revisions")
    .update({
      workflow_status: "aprovado_emissao",
      approved_at: new Date().toISOString(),
      approved_by: session.userId,
      immutable: true,
    })
    .eq("id", revisionId);

  if (error) {
    redirect(
      `/revisions/${revisionId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  await supabase.from("audit_events").insert({
    organization_id: session.organizationId,
    actor_id: session.userId,
    action: "revision.approve",
    entity_type: "drawing_revisions",
    entity_id: revisionId,
    payload: { notes, exception_records },
  });

  revalidatePath(`/revisions/${revisionId}`);
  redirect(`/revisions/${revisionId}?ok=Aprovado para emissão (imutável)`);
}

export async function rejectRevisionAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "conferente",
  ]);
  const revisionId = String(formData.get("revision_id") || "");
  const notes = String(formData.get("notes") || "").trim();
  const supabase = await createClient();

  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select("production_owner_id, immutable")
    .eq("id", revisionId)
    .single();

  if (!revision || revision.immutable) {
    redirect(`/revisions/${revisionId}?error=Revisão indisponível`);
  }
  if (revision.production_owner_id === session.userId) {
    redirect(
      `/revisions/${revisionId}?error=Não é permitido decidir sobre a própria prancha`,
    );
  }

  await supabase.from("approvals").insert({
    organization_id: session.organizationId,
    revision_id: revisionId,
    decision: "reprovado",
    decided_by: session.userId,
    notes: notes || null,
    exception_records: [],
  });

  await supabase
    .from("drawing_revisions")
    .update({ workflow_status: "com_pendencias" })
    .eq("id", revisionId);

  revalidatePath(`/revisions/${revisionId}`);
  redirect(`/revisions/${revisionId}?ok=Reprovado — devolvido com pendências`);
}
