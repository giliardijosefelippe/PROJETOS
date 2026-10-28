import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { convertCadBundle } from "@/lib/cad/client";
import { validateUpload } from "@/lib/validation/upload";

/**
 * Proxy autenticado → serviço Python.
 * Preferir uploadDrawingFileAction (grava Storage + drawing_files).
 * Esta rota é útil para smoke/testes e integrações.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }

  const form = await request.formData();
  const file = form.get("file") as File | null;
  const validation = validateUpload("drawing", file);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, code: validation.code, error: validation.message },
      { status: 400 },
    );
  }

  const name = file!.name.toLowerCase();
  if (!name.endsWith(".dxf") && !name.endsWith(".dwg")) {
    return NextResponse.json(
      {
        ok: false,
        error: "Esta rota converte apenas DXF/DWG. PDF use o upload da revisão.",
      },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file!.arrayBuffer());
    const bundle = await convertCadBundle(file!.name, buffer, file!.type);
    return NextResponse.json({
      ok: true,
      source_format: bundle.source_format,
      converter_path: bundle.converter_path,
      notes: bundle.notes,
      pdf_base64: bundle.pdf_bytes.toString("base64"),
      png_base64: bundle.png_bytes.toString("base64"),
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Falha na conversão",
      },
      { status: 502 },
    );
  }
}
