import { NextResponse } from "next/server";

/**
 * Upload de prancha (PDF/DXF/DWG) é feito via Server Action
 * `uploadDrawingFileAction` (multipart + redirect).
 * Mantemos esta rota como ponte documentada para clientes HTTP futuros.
 */
export async function POST() {
  return NextResponse.json(
    {
      ok: false,
      error:
        "Use o formulário da revisão (uploadDrawingFileAction) ou POST /api/cad/convert para smoke de conversão.",
    },
    { status: 405 },
  );
}
