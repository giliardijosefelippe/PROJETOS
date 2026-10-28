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

/**
 * Gera sugestões STUB de inconsistências — NÃO é interpretação estrutural validada.
 * Sempre status pending_human_review. Sem provider externo configurado.
 */
export async function generateAiStubHintsAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "conferente",
  ]);
  const revisionId = String(formData.get("revision_id") || "");
  const supabase = await createClient();

  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select("organization_id, immutable")
    .eq("id", revisionId)
    .single();

  if (!revision || revision.organization_id !== session.organizationId) {
    redirect(redirectWithError(`/revisions/${revisionId}`, AppErrors.NOT_FOUND));
  }

  const hints = [
    {
      title: "Conferir correspondência forma × tabela de vigas",
      detail:
        "Sugestão automática (stub): revisar se IDs da planta coincidem com a tabela. Revisão humana obrigatória — não é validação estrutural.",
      confidence: 0.4,
    },
    {
      title: "Verificar itens ainda não iniciados no checklist",
      detail:
        "Sugestão automática (stub): há possíveis lacunas de cobertura. A IA não substitui o conferente.",
      confidence: 0.35,
    },
  ];

  const { error } = await supabase.from("ai_suggestions").insert(
    hints.map((h) => ({
      organization_id: session.organizationId,
      revision_id: revisionId,
      source: "stub",
      kind: "inconsistency_hint",
      title: h.title,
      detail: h.detail,
      confidence: h.confidence,
      status: "pending_human_review",
      payload: {
        disclaimer:
          "Apoio à localização de inconsistências com revisão humana obrigatória. Não constitui interpretação estrutural automática validada.",
      },
      created_by: session.userId,
    })),
  );

  if (error) {
    redirect(redirectWithError(`/revisions/${revisionId}`, error.message));
  }

  await writeAudit({
    organizationId: session.organizationId,
    actorId: session.userId,
    action: "ai.stub_hints",
    entityType: "drawing_revisions",
    entityId: revisionId,
    payload: { count: hints.length },
  });

  revalidatePath(`/revisions/${revisionId}`);
  redirect(
    redirectWithOk(
      `/revisions/${revisionId}`,
      "Sugestões stub geradas — aguardam revisão humana",
    ),
  );
}

export async function reviewAiSuggestionAction(formData: FormData) {
  const session = await requireSession([
    "admin",
    "coordenador",
    "conferente",
    "desenhista",
  ]);
  const suggestionId = String(formData.get("suggestion_id") || "");
  const revisionId = String(formData.get("revision_id") || "");
  const decision = String(formData.get("decision") || "") as
    | "accepted"
    | "rejected"
    | "dismissed";

  if (!["accepted", "rejected", "dismissed"].includes(decision)) {
    redirect(redirectWithError(`/revisions/${revisionId}`, AppErrors.VALIDATION));
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("ai_suggestions")
    .update({
      status: decision,
      reviewed_by: session.userId,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", suggestionId)
    .eq("organization_id", session.organizationId);

  if (error) {
    redirect(redirectWithError(`/revisions/${revisionId}`, error.message));
  }

  revalidatePath(`/revisions/${revisionId}`);
  redirect(`/revisions/${revisionId}`);
}
