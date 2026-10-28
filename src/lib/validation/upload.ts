/** Validações de upload (MIME + tamanho) — Etapa C + DWG/DXF */

export type UploadKind =
  | "image"
  | "pdf"
  | "video"
  | "logo"
  | "evidence"
  | "drawing";

const LIMITS: Record<UploadKind, number> = {
  image: Number(process.env.UPLOAD_MAX_BYTES_IMAGE || 5 * 1024 * 1024),
  pdf: Number(process.env.UPLOAD_MAX_BYTES_PDF || 20 * 1024 * 1024),
  video: Number(process.env.UPLOAD_MAX_BYTES_VIDEO || 50 * 1024 * 1024),
  logo: 5 * 1024 * 1024,
  evidence: Number(process.env.UPLOAD_MAX_BYTES_PDF || 20 * 1024 * 1024),
  drawing: Number(process.env.UPLOAD_MAX_BYTES_DRAWING || 40 * 1024 * 1024),
};

const MIMES: Record<UploadKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  pdf: ["application/pdf"],
  video: ["video/mp4", "video/webm"],
  logo: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  evidence: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
  drawing: [
    "application/pdf",
    "application/dxf",
    "image/vnd.dxf",
    "application/x-dxf",
    "application/acad",
    "application/x-acad",
    "image/vnd.dwg",
    "application/octet-stream",
    "", // browsers often omit MIME for CAD
  ],
};

const DRAWING_EXT = [".pdf", ".dxf", ".dwg"];

export type DrawingSourceFormat = "pdf" | "dxf" | "dwg" | "unknown";

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

function extensionOf(name?: string) {
  if (!name) return "";
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function detectDrawingFormat(
  file: { type?: string; name?: string } | null | undefined,
): DrawingSourceFormat {
  const ext = extensionOf(file?.name);
  if (ext === ".pdf" || file?.type === "application/pdf") return "pdf";
  if (ext === ".dxf") return "dxf";
  if (ext === ".dwg") return "dwg";
  return "unknown";
}

export function validateUpload(
  kind: UploadKind,
  file: { type: string; size: number; name?: string } | null | undefined,
): UploadValidationResult {
  if (!file || file.size === 0) {
    return {
      ok: false,
      code: "UPLOAD_EMPTY",
      message: "Selecione um arquivo para enviar.",
    };
  }

  if (kind === "drawing") {
    const ext = extensionOf(file.name);
    const format = detectDrawingFormat(file);
    if (!DRAWING_EXT.includes(ext) || format === "unknown") {
      return {
        ok: false,
        code: "UPLOAD_MIME",
        message:
          "Formato não permitido. Aceitos na prancha: PDF, DXF e DWG.",
      };
    }
  } else {
    const allowed = MIMES[kind];
    if (!allowed.includes(file.type)) {
      return {
        ok: false,
        code: "UPLOAD_MIME",
        message: `Formato não permitido (${file.type || "desconhecido"}). Aceitos: ${allowed.filter(Boolean).join(", ")}.`,
      };
    }
  }

  const max = LIMITS[kind];
  if (file.size > max) {
    const mb = (max / (1024 * 1024)).toFixed(0);
    return {
      ok: false,
      code: "UPLOAD_SIZE",
      message: `Arquivo maior que o limite de ${mb} MB.`,
    };
  }
  return { ok: true };
}

export function uploadErrorRedirect(
  basePath: string,
  result: Extract<UploadValidationResult, { ok: false }>,
) {
  const sep = basePath.includes("?") ? "&" : "?";
  return `${basePath}${sep}error=${encodeURIComponent(result.message)}&error_code=${result.code}`;
}
