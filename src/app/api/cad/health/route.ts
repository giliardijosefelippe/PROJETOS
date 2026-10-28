import { NextResponse } from "next/server";
import { cadConvertHealth } from "@/lib/cad/client";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "Não autenticado" }, { status: 401 });
  }
  const health = await cadConvertHealth();
  return NextResponse.json(health, { status: health.ok ? 200 : 503 });
}
