import { NextResponse } from "next/server";
import { elementsCsvTemplate } from "@/lib/mapas/csv-elements";

export async function GET() {
  return new NextResponse(elementsCsvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition":
        'attachment; filename="mapaconcreto-elementos-template.csv"',
    },
  });
}
