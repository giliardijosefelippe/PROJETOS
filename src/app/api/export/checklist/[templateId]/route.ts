import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checklistItemsToCsv } from "@/lib/spreadsheet";

export async function GET(
  _request: Request,
  context: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await context.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("id, name, current_version_id, organization_id")
    .eq("id", templateId)
    .single();

  if (!template?.current_version_id) {
    return NextResponse.json({ error: "Template não encontrado" }, { status: 404 });
  }

  const { data: sections } = await supabase
    .from("checklist_sections")
    .select("title, checklist_items(*)")
    .eq("template_version_id", template.current_version_id)
    .order("sort_order");

  const items = (sections || []).flatMap((s) =>
    (s.checklist_items || []).map(
      (i: Record<string, unknown>) => ({
        section_title: s.title,
        code: String(i.code),
        title: String(i.title),
        objective: i.objective as string | null,
        steps: i.steps,
        verifiable_parameter: i.verifiable_parameter as string | null,
        acceptance_criteria: i.acceptance_criteria as string | null,
        priority: i.priority as string,
        is_blocking: Boolean(i.is_blocking),
        instructions: i.instructions as string | null,
        technical_reference: i.technical_reference as { note?: string } | null,
      }),
    ),
  );

  const csv = checklistItemsToCsv(items);
  const filename = `checklist-${template.name.replace(/\s+/g, "-").toLowerCase()}.csv`;

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
