/**
 * Server-side PDF page → PNG (real plant preview for reports).
 * Does not invent geometry — rasterizes the provided PDF bytes as-is.
 */

export type PdfRasterResult = {
  png: Buffer;
  width: number;
  height: number;
  page: number;
  pageCount: number;
};

export type PdfRasterOptions = {
  page?: number;
  /** Render scale (default 1.25). Capped by maxWidthPx. */
  scale?: number;
  maxWidthPx?: number;
};

/**
 * Rasterize one page of a PDF to PNG using pdfjs + @napi-rs/canvas.
 * Returns null when the PDF cannot be rendered (caller should keep schematic).
 */
export async function renderPdfPageToPng(
  pdfBytes: Uint8Array | Buffer,
  opts: PdfRasterOptions = {},
): Promise<PdfRasterResult | null> {
  if (!pdfBytes || pdfBytes.byteLength < 8) return null;

  try {
    const { createCanvas } = await import("@napi-rs/canvas");
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");

    const data =
      pdfBytes instanceof Buffer
        ? new Uint8Array(pdfBytes)
        : new Uint8Array(pdfBytes);

    const loadingTask = pdfjs.getDocument({
      data,
      useSystemFonts: true,
      isEvalSupported: false,
      // Node: avoid worker thread; typed loosely for pdfjs version drift
      ...( { disableWorker: true } as Record<string, unknown> ),
    } as Parameters<typeof pdfjs.getDocument>[0]);
    const doc = await loadingTask.promise;
    const pageCount = doc.numPages;
    const pageNum = Math.min(
      Math.max(1, opts.page ?? 1),
      Math.max(1, pageCount),
    );
    const page = await doc.getPage(pageNum);

    let scale = opts.scale ?? 1.25;
    const base = page.getViewport({ scale: 1 });
    const maxW = opts.maxWidthPx ?? 1200;
    if (base.width * scale > maxW) {
      scale = maxW / Math.max(base.width, 1);
    }
    const viewport = page.getViewport({ scale });
    const width = Math.max(1, Math.ceil(viewport.width));
    const height = Math.max(1, Math.ceil(viewport.height));
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    await page.render({
      canvasContext: ctx as unknown as CanvasRenderingContext2D,
      viewport,
      canvas: canvas as unknown as HTMLCanvasElement,
    }).promise;

    const png = canvas.toBuffer("image/png");
    const maybeDestroy = doc as unknown as { destroy?: () => Promise<void> };
    if (typeof maybeDestroy.destroy === "function") {
      await maybeDestroy.destroy();
    }
    return { png, width, height, page: pageNum, pageCount };
  } catch (err) {
    if (process.env.MC_PDF_RASTER_DEBUG) {
      console.error("[pdf-raster]", err);
    }
    return null;
  }
}
