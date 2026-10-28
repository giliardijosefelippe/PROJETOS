import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rowsToCsv } from "@/lib/spreadsheet";
import type { ResponseStatus } from "@/lib/types/domain";
import { RESPONSE_LABELS } from "@/lib/types/domain";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ revisionId: string }> },
) {
  const { revisionId } = await context.params;
  const activity = request.nextUrl.searchParams.get("activity") || "conferencia";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: runs } = await supabase
    .from("checklist_runs")
    .select("id")
    .eq("revision_id", revisionId)
    .eq("activity_kind", activity)
    .order("created_at", { ascending: false })
    .limit(1);

  const run = runs?.[0];
  if (!run) {
    return NextResponse.json(
      { error: "Nenhum run encontrado para exportar" },
      { status: 404 },
    );
  }

  const { data: items } = await supabase
    .from("checklist_run_items")
    .select(
      "code, title, priority, is_blocking, section_title, checklist_item_responses(status, comment)",
    )
    .eq("run_id", run.id)
    .order("sort_order");

  const rows =
    items?.map((i) => {
      const resp = i.checklist_item_responses as
        | { status: ResponseStatus; comment: string | null }
        | { status: ResponseStatus; comment: string | null }[]
        | null;
      const r = Array.isArray(resp) ? resp[0] : resp;
      return {
        section_title: i.section_title,
        code: i.code,
        title: i.title,
        priority: i.priority,
        is_blocking: i.is_blocking ? "sim" : "nao",
        status: RESPONSE_LABELS[r?.status || "nao_iniciado"],
        comment: r?.comment || "",
      };
    }) || [];

  const csv = rowsToCsv(
    [
      "section_title",
      "code",
      "title",
      "priority",
      "is_blocking",
      "status",
      "comment",
    ],
    rows,
  );

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="revisao-${revisionId.slice(0, 8)}-${activity}.csv"`,
    },
  });
}
