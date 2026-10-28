"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { writeAudit } from "@/lib/audit/log";
import {
  AppErrors,
  redirectWithError,
  redirectWithOk,
} from "@/lib/validation/errors";

export async function createAnnotationAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const revisionId = String(formData.get("revision_id") || "");
  const pageNumber = Number(formData.get("page_number") || 1);
  const x = Number(formData.get("x"));
  const y = Number(formData.get("y"));
  const label = String(formData.get("label") || "").trim() || "Marcação";
  const note = String(formData.get("note") || "").trim() || null;

  if (
    Number.isNaN(x) ||
    Number.isNaN(y) ||
    x < 0 ||
    x > 1 ||
    y < 0 ||
    y > 1
  ) {
    redirect(
      redirectWithError(
        `/revisions/${revisionId}/annotations`,
        "Coordenadas devem estar entre 0 e 1.",
      ),
    );
  }

  const supabase = await createClient();
  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select("immutable, organization_id")
    .eq("id", revisionId)
    .single();

  if (!revision || revision.organization_id !== session.organizationId) {
    redirect(
      redirectWithError(`/revisions/${revisionId}/annotations`, AppErrors.NOT_FOUND),
    );
  }
  if (revision.immutable) {
    redirect(
      redirectWithError(
        `/revisions/${revisionId}/annotations`,
        AppErrors.IMMUTABLE_REVISION,
      ),
    );
  }

  const { error } = await supabase.from("drawing_annotations").insert({
    organization_id: session.organizationId,
    revision_id: revisionId,
    page_number: pageNumber || 1,
    x,
    y,
    label,
    note,
    color: "#E00024",
    created_by: session.userId,
  });

  if (error) {
    redirect(
      redirectWithError(`/revisions/${revisionId}/annotations`, error.message),
    );
  }

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "annotation.create",
    entityType: "drawing_annotations",
    entityId: revisionId,
    payload: { x, y, label, page_number: pageNumber },
  });

  revalidatePath(`/revisions/${revisionId}/annotations`);
  redirect(
    redirectWithOk(`/revisions/${revisionId}/annotations`, "Marcação criada"),
  );
}

export async function deleteAnnotationAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "desenhista",
    "conferente",
  ]);
  const revisionId = String(formData.get("revision_id") || "");
  const annotationId = String(formData.get("annotation_id") || "");
  const supabase = await createClient();

  const { error } = await supabase
    .from("drawing_annotations")
    .delete()
    .eq("id", annotationId)
    .eq("organization_id", session.organizationId);

  if (error) {
    redirect(
      redirectWithError(`/revisions/${revisionId}/annotations`, error.message),
    );
  }

  revalidatePath(`/revisions/${revisionId}/annotations`);
  redirect(`/revisions/${revisionId}/annotations`);
}
