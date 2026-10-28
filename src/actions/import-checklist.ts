"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { parseChecklistCsv } from "@/lib/spreadsheet";
import { writeAudit } from "@/lib/audit/log";
import {
  AppErrors,
  redirectWithError,
  redirectWithOk,
} from "@/lib/validation/errors";

export async function importChecklistCsvAction(formData: FormData) {
  const session = await requireSession(["admin", "coordenador"]);
  const templateId = String(formData.get("template_id") || "");
  const versionId = String(formData.get("version_id") || "");
  const file = formData.get("file") as File | null;

  if (!file || file.size === 0) {
    redirect(
      redirectWithError(`/templates/${templateId}`, "Selecione um arquivo CSV."),
    );
  }
  if (file.size > 2 * 1024 * 1024) {
    redirect(
      redirectWithError(`/templates/${templateId}`, "CSV maior que 2 MB."),
    );
  }

  const text = await file.text();
  const { rows, errors } = parseChecklistCsv(text);
  if (errors.length) {
    redirect(
      redirectWithError(
        `/templates/${templateId}`,
        errors.slice(0, 3).join(" "),
      ),
    );
  }
  if (!rows.length) {
    redirect(
      redirectWithError(`/templates/${templateId}`, "Nenhuma linha válida."),
    );
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
    redirect(
      redirectWithError(`/templates/${templateId}`, AppErrors.IMMUTABLE_TEMPLATE),
    );
  }

  const sectionCache = new Map<string, string>();
  const { data: existingSections } = await supabase
    .from("checklist_sections")
    .select("id, title, sort_order")
    .eq("template_version_id", versionId);

  for (const s of existingSections || []) {
    sectionCache.set(s.title, s.id);
  }

  let sectionOrder = (existingSections || []).length;
  let itemCount = 0;

  for (const row of rows) {
    let sectionId = sectionCache.get(row.section_title);
    if (!sectionId) {
      sectionOrder += 1;
      const { data: section, error } = await supabase
        .from("checklist_sections")
        .insert({
          template_version_id: versionId,
          title: row.section_title,
          sort_order: sectionOrder,
        })
        .select("id")
        .single();
      if (error || !section) {
        redirect(
          redirectWithError(
            `/templates/${templateId}`,
            error?.message || "Falha ao criar seção",
          ),
        );
      }
      sectionId = section.id as string;
      sectionCache.set(row.section_title, sectionId);
    }

    if (!sectionId) {
      redirect(
        redirectWithError(`/templates/${templateId}`, "Seção inválida no import."),
      );
    }

    const { count } = await supabase
      .from("checklist_items")
      .select("*", { count: "exact", head: true })
      .eq("section_id", sectionId);

    const steps = row.steps
      ? row.steps.split("|").map((s) => s.trim()).filter(Boolean)
      : [];

    const { error: itemErr } = await supabase.from("checklist_items").insert({
      template_version_id: versionId,
      section_id: sectionId,
      code: row.code,
      title: row.title,
      objective: row.objective || null,
      steps,
      verifiable_parameter: row.verifiable_parameter || null,
      acceptance_criteria: row.acceptance_criteria || null,
      priority: row.priority || "media",
      is_blocking: Boolean(row.is_blocking),
      instructions: row.instructions || null,
      technical_reference: row.technical_reference_note
        ? {
            note: row.technical_reference_note,
            norm: null,
            edition: null,
            item: null,
          }
        : null,
      sort_order: (count || 0) + 1,
    });

    if (itemErr) {
      redirect(
        redirectWithError(
          `/templates/${templateId}`,
          `Item ${row.code}: ${itemErr.message}`,
        ),
      );
    }
    itemCount += 1;
  }

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "template.import_csv",
    entityType: "checklist_templates",
    entityId: templateId,
    payload: { versionId, itemCount },
  });

  revalidatePath(`/templates/${templateId}`);
  redirect(
    redirectWithOk(
      `/templates/${templateId}`,
      `${itemCount} item(ns) importado(s) do CSV`,
    ),
  );
}
