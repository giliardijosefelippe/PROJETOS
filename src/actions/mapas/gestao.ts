"use server";

import { createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession, canApprove } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import { validateUpload } from "@/lib/validation/upload";
import {
  canTransitionPourStatus,
  structuralApprovalDisclaimer,
} from "@/lib/mapas/pour-workflow";
import type { McPourStatus } from "@/lib/mapas/types";

const EVIDENCE = process.env.STORAGE_BUCKET_EVIDENCE || "evidence";

async function notifyOrgMembers(args: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  organizationId: string;
  siteId: string;
  kind: string;
  title: string;
  body: string;
  href: string;
  excludeUserId?: string;
}) {
  const { data: members } = await args.supabase
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", args.organizationId)
    .eq("status", "active");

  const rows = (members || [])
    .map((m) => m.user_id)
    .filter((id) => id && id !== args.excludeUserId)
    .map((user_id) => ({
      organization_id: args.organizationId,
      user_id,
      site_id: args.siteId,
      kind: args.kind,
      title: args.title,
      body: args.body,
      href: args.href,
      payload: {},
    }));

  if (rows.length) {
    await args.supabase.from("mc_notifications").insert(rows);
  }
}

export async function transitionPourStatusAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "conferente",
  ]);
  if (!canApprove(session.role)) {
    redirect(`/mapas/?error=Sem permissão para alterar status`);
  }
  const siteId = String(formData.get("site_id") || "");
  const pourId = String(formData.get("pour_id") || "");
  const toStatus = String(formData.get("to_status") || "") as McPourStatus;
  const justification = String(formData.get("justification") || "").trim();

  const supabase = await createClient();
  const { data: pour } = await supabase
    .from("mc_concrete_pours")
    .select("id, code, status, title")
    .eq("id", pourId)
    .eq("site_id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!pour) {
    redirect(`/mapas/${siteId}/concretagens?error=Concretagem não encontrada`);
  }

  const check = canTransitionPourStatus(
    pour.status as McPourStatus,
    toStatus,
    justification,
  );
  if (!check.ok) {
    redirect(
      `/mapas/${siteId}/concretagens/${pourId}?error=${encodeURIComponent(check.message)}`,
    );
  }

  const before = { status: pour.status };
  const after = { status: toStatus };

  const { error } = await supabase
    .from("mc_concrete_pours")
    .update({
      status: toStatus,
      updated_at: new Date().toISOString(),
      ended_at:
        toStatus === "encerrada" ? new Date().toISOString() : undefined,
    })
    .eq("id", pourId)
    .eq("organization_id", session.organizationId);

  if (error) {
    redirect(
      `/mapas/${siteId}/concretagens/${pourId}?error=${encodeURIComponent(error.message)}`,
    );
  }

  await supabase.from("mc_pour_status_history").insert({
    organization_id: session.organizationId,
    pour_id: pourId,
    from_status: pour.status,
    to_status: toStatus,
    justification:
      justification ||
      `Transição ${pour.status} → ${toStatus}`,
    structural_approval_claimed: false,
    decided_by: session.userId,
  });

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "mc.pour.status",
    entityType: "mc_concrete_pours",
    entityId: pourId,
    payload: {
      before,
      after,
      justification,
      disclaimer: structuralApprovalDisclaimer(),
    },
  });

  await notifyOrgMembers({
    supabase,
    organizationId: session.organizationId,
    siteId,
    kind: "pour_status",
    title: `Status ${pour.code}: ${toStatus}`,
    body: justification || structuralApprovalDisclaimer(),
    href: `/mapas/${siteId}/concretagens/${pourId}`,
    excludeUserId: session.userId,
  });

  revalidatePath(`/mapas/${siteId}/concretagens/${pourId}`);
  revalidatePath(`/mapas/${siteId}/painel`);
  revalidatePath(`/mapas/${siteId}/notificacoes`);
  redirect(`/mapas/${siteId}/concretagens/${pourId}?ok=status`);
}

export async function createOccurrenceAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const pourId = String(formData.get("pour_id") || "") || null;
  const title = String(formData.get("title") || "").trim();
  const description = String(formData.get("description") || "").trim() || null;
  const severity = String(formData.get("severity") || "media");
  const responsible =
    String(formData.get("responsible_name") || "").trim() || null;
  const dueDate = String(formData.get("due_date") || "") || null;
  const corrective =
    String(formData.get("corrective_action") || "").trim() || null;
  const redirectTo = String(formData.get("redirect_to") || "") ||
    `/mapas/${siteId}/campo`;

  if (!siteId || !title) {
    redirect(`${redirectTo}?error=Título da ocorrência obrigatório`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mc_site_occurrences")
    .insert({
      organization_id: session.organizationId,
      site_id: siteId,
      pour_id: pourId,
      title,
      description,
      severity,
      status: "aberta",
      corrective_action: corrective,
      responsible_name: responsible,
      due_date: dueDate,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `${redirectTo}?error=${encodeURIComponent(error?.message || "Falha")}`,
    );
  }

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "mc.occurrence.create",
    entityType: "mc_site_occurrences",
    entityId: data.id,
    payload: { before: null, after: { title, severity, status: "aberta" } },
  });

  await notifyOrgMembers({
    supabase,
    organizationId: session.organizationId,
    siteId,
    kind: "occurrence",
    title: `Ocorrência: ${title}`,
    body: `Severidade ${severity}${responsible ? ` · ${responsible}` : ""}`,
    href: `/mapas/${siteId}/campo`,
    excludeUserId: session.userId,
  });

  revalidatePath(`/mapas/${siteId}/campo`);
  revalidatePath(`/mapas/${siteId}/painel`);
  revalidatePath(`/mapas/${siteId}/notificacoes`);
  redirect(`${redirectTo}?ok=ocorrencia`);
}

export async function createFieldNoteAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const pourId = String(formData.get("pour_id") || "") || null;
  const note = String(formData.get("note") || "").trim();
  if (!siteId || !note) {
    redirect(`/mapas/${siteId}/campo?error=Informe a nota de campo`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("mc_field_notes")
    .insert({
      organization_id: session.organizationId,
      site_id: siteId,
      pour_id: pourId,
      note,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(
      `/mapas/${siteId}/campo?error=${encodeURIComponent(error?.message || "Falha")}`,
    );
  }

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "mc.field_note.create",
    entityType: "mc_field_notes",
    entityId: data.id,
    payload: { before: null, after: { note: note.slice(0, 200) } },
  });

  revalidatePath(`/mapas/${siteId}/campo`);
  redirect(`/mapas/${siteId}/campo?ok=nota`);
}

export async function uploadFieldPhotoAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const siteId = String(formData.get("site_id") || "");
  const pourId = String(formData.get("pour_id") || "") || null;
  const description =
    String(formData.get("description") || "").trim() || "Foto de campo";
  const file = formData.get("file");

  if (!siteId || !(file instanceof File) || file.size === 0) {
    redirect(`/mapas/${siteId}/campo?error=Selecione uma foto`);
  }

  const validation = validateUpload("evidence", file);
  if (!validation.ok) {
    redirect(`/mapas/${siteId}/campo?error=${encodeURIComponent(validation.message)}`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const hash = createHash("sha256").update(buffer).digest("hex");
  const safe = file.name.replace(/[^\w.\-]+/g, "_");
  const path = `${session.organizationId}/mapas/${siteId}/campo/${hash.slice(0, 12)}_${safe}`;

  const supabase = await createClient();
  const { error: upErr } = await supabase.storage
    .from(EVIDENCE)
    .upload(path, buffer, {
      contentType: file.type || "image/jpeg",
      upsert: false,
    });
  if (upErr) {
    redirect(`/mapas/${siteId}/campo?error=${encodeURIComponent(upErr.message)}`);
  }

  const { data: att, error } = await supabase
    .from("mc_attachments")
    .insert({
      organization_id: session.organizationId,
      storage_path: path,
      file_name: file.name,
      mime_type: file.type || "image/jpeg",
      byte_size: file.size,
      content_hash: hash,
      description,
      created_by: session.userId,
    })
    .select("id")
    .single();

  if (error || !att) {
    redirect(
      `/mapas/${siteId}/campo?error=${encodeURIComponent(error?.message || "Falha")}`,
    );
  }

  await supabase.from("mc_attachment_links").insert({
    organization_id: session.organizationId,
    attachment_id: att.id,
    parent_kind: pourId ? "pour" : "site",
    parent_id: pourId || siteId,
  });

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "mc.field_photo.upload",
    entityType: "mc_attachments",
    entityId: att.id,
    payload: { before: null, after: { file: file.name, hash } },
  });

  revalidatePath(`/mapas/${siteId}/campo`);
  redirect(`/mapas/${siteId}/campo?ok=foto`);
}

export async function markNotificationReadAction(formData: FormData) {
  const session = await requireSession();
  const id = String(formData.get("notification_id") || "");
  const siteId = String(formData.get("site_id") || "");
  const supabase = await createClient();
  await supabase
    .from("mc_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", session.userId);

  revalidatePath(`/mapas/${siteId}/notificacoes`);
  redirect(`/mapas/${siteId}/notificacoes`);
}

export async function markAllNotificationsReadAction(formData: FormData) {
  const session = await requireSession();
  const siteId = String(formData.get("site_id") || "");
  const supabase = await createClient();
  let q = supabase
    .from("mc_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", session.userId)
    .is("read_at", null);
  if (siteId) q = q.eq("site_id", siteId);
  await q;

  revalidatePath(`/mapas/${siteId}/notificacoes`);
  redirect(`/mapas/${siteId}/notificacoes?ok=lidas`);
}
