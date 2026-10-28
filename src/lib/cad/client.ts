/**
 * Cliente servidor → microserviço Python (ezdxf / ODA).
 * Browser nunca chama CAD_CONVERT_URL diretamente.
 */

export type CadBundleResult = {
  ok: true;
  source_format: string;
  converter_path: string;
  notes: string[];
  original_filename: string;
  pdf_bytes: Buffer;
  png_bytes: Buffer;
  pdf_mime: string;
  png_mime: string;
};

export type CadHealth = {
  ok: boolean;
  service?: string;
  ezdxf?: boolean;
  oda_file_converter?: boolean;
  dwg_supported?: boolean;
  dxf_supported?: boolean;
  notes?: string[];
  error?: string;
};

export function getCadConvertUrl() {
  return (
    process.env.CAD_CONVERT_URL?.replace(/\/$/, "") ||
    "http://127.0.0.1:8091"
  );
}

export async function cadConvertHealth(): Promise<CadHealth> {
  const base = getCadConvertUrl();
  try {
    const res = await fetch(`${base}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as CadHealth;
    return { ...data, ok: Boolean(data.ok) };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "serviço indisponível",
    };
  }
}

export async function convertCadBundle(
  filename: string,
  bytes: Buffer,
  contentType?: string,
): Promise<CadBundleResult> {
  const base = getCadConvertUrl();
  const form = new FormData();
  const blob = new Blob([new Uint8Array(bytes)], {
    type: contentType || "application/octet-stream",
  });
  form.append("file", blob, filename);

  let res: Response;
  try {
    res = await fetch(`${base}/convert/bundle`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(
        Number(process.env.CAD_CONVERT_TIMEOUT_MS || 120_000),
      ),
    });
  } catch (err) {
    throw new Error(
      `Serviço CAD indisponível (${base}): ${
        err instanceof Error ? err.message : "erro de rede"
      }. Suba services/cad-convert (veja README).`,
    );
  }

  const payload = (await res.json().catch(() => null)) as
    | {
        ok?: boolean;
        source_format?: string;
        converter_path?: string;
        notes?: string[];
        original_filename?: string;
        pdf_base64?: string;
        png_base64?: string;
        pdf_mime?: string;
        png_mime?: string;
        detail?: { code?: string; message?: string } | string;
      }
    | null;

  if (!res.ok || !payload?.pdf_base64 || !payload?.png_base64) {
    const detail =
      typeof payload?.detail === "string"
        ? payload.detail
        : payload?.detail?.message ||
          payload?.detail?.code ||
          `HTTP ${res.status}`;
    throw new Error(String(detail));
  }

  return {
    ok: true,
    source_format: payload.source_format || "dxf",
    converter_path: payload.converter_path || "ezdxf",
    notes: payload.notes || [],
    original_filename: payload.original_filename || filename,
    pdf_bytes: Buffer.from(payload.pdf_base64, "base64"),
    png_bytes: Buffer.from(payload.png_base64, "base64"),
    pdf_mime: payload.pdf_mime || "application/pdf",
    png_mime: payload.png_mime || "image/png",
  };
}
