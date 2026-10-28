import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildReportPdf } from "@/lib/pdf/report";
import { computeIndicators } from "@/lib/workflow";
import type { ReportType, ResponseStatus } from "@/lib/types/domain";
import { RESPONSE_LABELS } from "@/lib/types/domain";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const revisionId = String(body.revisionId || "");
    const reportType = String(body.reportType || "conferencia") as ReportType;

    if (!revisionId) {
      return NextResponse.json({ error: "revisionId obrigatório" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
    }

    const { data: revision } = await supabase
      .from("drawing_revisions")
      .select("*")
      .eq("id", revisionId)
      .single();

    if (!revision) {
      return NextResponse.json({ error: "Revisão não encontrada" }, { status: 404 });
    }

    const { data: drawing } = await supabase
      .from("drawings")
      .select("id, number, title, project_id, organization_id")
      .eq("id", revision.drawing_id)
      .single();

    if (!drawing) {
      return NextResponse.json({ error: "Prancha não encontrada" }, { status: 404 });
    }

    const { data: project } = await supabase
      .from("projects")
      .select("id, code, name, organization_id")
      .eq("id", drawing.project_id)
      .single();

    const { data: org } = await supabase
      .from("organizations")
      .select("name, logo_storage_path")
      .eq("id", drawing.organization_id)
      .single();

    const { data: authorProfile } = revision.production_owner_id
      ? await supabase
          .from("users_profiles")
          .select("full_name")
          .eq("user_id", revision.production_owner_id)
          .maybeSingle()
      : { data: null };

    const { data: reviewerProfile } = revision.reviewer_id
      ? await supabase
          .from("users_profiles")
          .select("full_name")
          .eq("user_id", revision.reviewer_id)
          .maybeSingle()
      : { data: null };

    const activity =
      reportType === "producao" ? "producao" : "conferencia";

    const { data: runs } = await supabase
      .from("checklist_runs")
      .select("id, template_snapshot, activity_kind")
      .eq("revision_id", revisionId)
      .eq("activity_kind", activity)
      .order("created_at", { ascending: false })
      .limit(1);

    const run = runs?.[0];
    let items: Array<{
      code: string;
      title: string;
      status: string;
      comment?: string | null;
      blocking?: boolean;
    }> = [];
    let summary = {
      conforme: 0,
      nao_conforme: 0,
      nao_aplicavel: 0,
      pendente: 0,
      nao_iniciado: 0,
      conformidade: null as number | null,
      cobertura: null as number | null,
    };

    if (run) {
      const { data: runItems } = await supabase
        .from("checklist_run_items")
        .select(
          "id, code, title, is_blocking, checklist_item_responses(status, comment)",
        )
        .eq("run_id", run.id)
        .order("sort_order");

      items =
        runItems?.map((i) => {
          const resp = i.checklist_item_responses as
            | { status: ResponseStatus; comment: string | null }
            | { status: ResponseStatus; comment: string | null }[]
            | null;
          const r = Array.isArray(resp) ? resp[0] : resp;
          return {
            code: i.code,
            title: i.title,
            status: RESPONSE_LABELS[r?.status || "nao_iniciado"],
            comment: r?.comment,
            blocking: i.is_blocking,
          };
        }) || [];

      const statuses =
        runItems?.map((i) => {
          const resp = i.checklist_item_responses as
            | { status: ResponseStatus }
            | { status: ResponseStatus }[]
            | null;
          const r = Array.isArray(resp) ? resp[0] : resp;
          return { status: (r?.status || "nao_iniciado") as ResponseStatus };
        }) || [];

      const ind = computeIndicators(statuses);
      summary = {
        conforme: ind.conforme,
        nao_conforme: ind.nao_conforme,
        nao_aplicavel: ind.nao_aplicavel,
        pendente: ind.pendente_verificacao,
        nao_iniciado: ind.nao_iniciado,
        conformidade: ind.conformidade,
        cobertura: ind.cobertura,
      };
    }

    const { data: issues } = await supabase
      .from("issues")
      .select("code, title, status, priority, description")
      .eq("revision_id", revisionId)
      .order("opened_at");

    let logoBuffer: Buffer | null = null;
    if (org?.logo_storage_path) {
      const bucket = process.env.STORAGE_BUCKET_LIBRARY || "library";
      const { data: logoData } = await supabase.storage
        .from(bucket)
        .download(org.logo_storage_path);
      if (logoData) {
        logoBuffer = Buffer.from(await logoData.arrayBuffer());
      }
    }

    const snap = run?.template_snapshot as
      | { template?: { name?: string; version_number?: number } }
      | null;

    const { data: profile } = await supabase
      .from("users_profiles")
      .select("full_name")
      .eq("user_id", user.id)
      .maybeSingle();

    const pdf = await buildReportPdf({
      reportType,
      organizationName: org?.name || "Lunardeli Engenharia",
      logoBuffer,
      projectCode: project?.code || "",
      projectName: project?.name || "",
      drawingNumber: drawing.number,
      drawingTitle: drawing.title,
      revisionCode: revision.revision_code,
      templateName: snap?.template?.name,
      templateVersion: snap?.template?.version_number,
      authorName: authorProfile?.full_name,
      reviewerName: reviewerProfile?.full_name,
      generatedBy: profile?.full_name || user.email || user.id,
      generatedAt: new Date(),
      items: reportType === "pendencias" ? [] : items,
      issues: issues || [],
      summary,
    });

    const orgId = drawing.organization_id;
    const bucket = process.env.STORAGE_BUCKET_REPORTS || "reports";
    const storagePath = `${orgId}/reports/${revisionId}/${reportType}-${Date.now()}.pdf`;

    await supabase.storage.from(bucket).upload(storagePath, pdf, {
      contentType: "application/pdf",
      upsert: false,
    });

    await supabase.from("report_exports").insert({
      organization_id: orgId,
      report_type: reportType,
      filters: { revisionId },
      storage_path: storagePath,
      generated_by: user.id,
      revision_id: revisionId,
      project_id: drawing.project_id,
    });

    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="relatorio-${reportType}-${revision.revision_code}.pdf"`,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Erro ao gerar PDF";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
