"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, canApprove } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { canApproveRevision } from "@/lib/approval";
import { writeAudit } from "@/lib/audit/log";
import {
  AppErrors,
  redirectWithError,
  redirectWithOk,
} from "@/lib/validation/errors";
import type { IssueStatus, ResponseStatus } from "@/lib/types/domain";

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
    .eq("organization_id", session.organizationId)
    .single();

  if (!revision) {
    redirect(redirectWithError(`/revisions/${revisionId}`, AppErrors.NOT_FOUND));
  }

  const { data: runs } = await supabase
    .from("checklist_runs")
    .select("id")
    .eq("revision_id", revisionId)
    .eq("activity_kind", "conferencia")
    .order("created_at", { ascending: false })
    .limit(1);

  const confRun = runs?.[0];
  let flattened: Array<{
    id: string;
    code: string;
    title: string;
    is_blocking: boolean;
    priority: string;
    status: ResponseStatus;
  }> = [];

  if (confRun) {
    const { data: items } = await supabase
      .from("checklist_run_items")
      .select(
        "id, code, title, is_blocking, priority, checklist_item_responses(status)",
      )
      .eq("run_id", confRun.id);

    flattened =
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
  }

  const { data: issues } = await supabase
    .from("issues")
    .select("status")
    .eq("revision_id", revisionId);

  const check = canApproveRevision({
    actorId: session.userId,
    productionOwnerId: revision.production_owner_id,
    immutable: revision.immutable,
    items: flattened,
    openIssueStatuses: (issues || []).map((i) => i.status as IssueStatus),
    exceptionNote,
  });

  if (!check.ok) {
    redirect(redirectWithError(`/revisions/${revisionId}`, check.message));
  }

  const { error: apprErr } = await supabase.from("approvals").insert({
    organization_id: session.organizationId,
    revision_id: revisionId,
    decision: "aprovado_emissao",
    decided_by: session.userId,
    notes,
    exception_records: check.exceptionRecords,
  });

  if (apprErr) {
    redirect(
      redirectWithError(
        `/revisions/${revisionId}`,
        apprErr.message.includes("própria")
          ? AppErrors.SELF_APPROVAL
          : apprErr.message,
      ),
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
    redirect(redirectWithError(`/revisions/${revisionId}`, error.message));
  }

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "revision.approve",
    entityType: "drawing_revisions",
    entityId: revisionId,
    payload: { notes, exception_records: check.exceptionRecords },
  });

  revalidatePath(`/revisions/${revisionId}`);
  redirect(
    redirectWithOk(
      `/revisions/${revisionId}`,
      "Aprovado para emissão (imutável)",
    ),
  );
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
    redirect(
      redirectWithError(`/revisions/${revisionId}`, AppErrors.IMMUTABLE_REVISION),
    );
  }
  if (revision.production_owner_id === session.userId) {
    redirect(
      redirectWithError(`/revisions/${revisionId}`, AppErrors.SELF_APPROVAL),
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

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "revision.reject",
    entityType: "drawing_revisions",
    entityId: revisionId,
    payload: { notes },
  });

  revalidatePath(`/revisions/${revisionId}`);
  redirect(
    redirectWithOk(
      `/revisions/${revisionId}`,
      "Reprovado — devolvido com pendências",
    ),
  );
}
