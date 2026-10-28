import { NextResponse } from "next/server";
import { CHECKLIST_CSV_TEMPLATE } from "@/lib/spreadsheet";

export async function GET() {
  return new NextResponse(CHECKLIST_CSV_TEMPLATE, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="modelo-importacao-checklist.csv"',
    },
  });
}
