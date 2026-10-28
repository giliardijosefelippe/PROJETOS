/** Validações de upload (MIME + tamanho) — Etapa C */

export type UploadKind = "image" | "pdf" | "video" | "logo" | "evidence";

const LIMITS: Record<UploadKind, number> = {
  image: Number(process.env.UPLOAD_MAX_BYTES_IMAGE || 5 * 1024 * 1024),
  pdf: Number(process.env.UPLOAD_MAX_BYTES_PDF || 20 * 1024 * 1024),
  video: Number(process.env.UPLOAD_MAX_BYTES_VIDEO || 50 * 1024 * 1024),
  logo: 5 * 1024 * 1024,
  evidence: Number(process.env.UPLOAD_MAX_BYTES_PDF || 20 * 1024 * 1024),
};

const MIMES: Record<UploadKind, string[]> = {
  image: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  pdf: ["application/pdf"],
  video: ["video/mp4", "video/webm"],
  logo: ["image/png", "image/jpeg", "image/webp", "image/svg+xml"],
  evidence: ["image/jpeg", "image/png", "image/webp", "application/pdf"],
};

export type UploadValidationResult =
  | { ok: true }
  | { ok: false; code: string; message: string };

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
  const allowed = MIMES[kind];
  if (!allowed.includes(file.type)) {
    return {
      ok: false,
      code: "UPLOAD_MIME",
      message: `Formato não permitido (${file.type || "desconhecido"}). Aceitos: ${allowed.join(", ")}.`,
    };
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
