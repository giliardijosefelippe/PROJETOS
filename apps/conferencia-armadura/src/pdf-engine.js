import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfWorkerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/**
 * Load and render a PDF page onto a canvas.
 * @param {string|Uint8Array|{data:Uint8Array}|{url:string}} source
 */
export async function loadPdf(source) {
  const options =
    typeof source === "string"
      ? { url: source, withCredentials: false }
      : source && source.data
        ? { data: source.data }
        : source;

  const loadingTask = pdfjs.getDocument({
    ...options,
    // More reliable on mobile / wrapped WebViews
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdf = await loadingTask.promise;
  return pdf;
}

/**
 * @param {import('pdfjs-dist').PDFDocumentProxy} pdf
 * @param {HTMLCanvasElement} canvas
 * @param {object} options
 */
export async function renderPage(pdf, canvas, options = {}) {
  const pageNumber = options.pageNumber || 1;
  const baseScale = options.baseScale || 1.5;
  const rotation = ((options.rotation || 0) % 360 + 360) % 360;

  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: baseScale, rotation });

  const outputScale = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(viewport.width * outputScale);
  canvas.height = Math.floor(viewport.height * outputScale);
  canvas.style.width = `${Math.floor(viewport.width)}px`;
  canvas.style.height = `${Math.floor(viewport.height)}px`;

  const ctx = canvas.getContext("2d", { alpha: false });
  if (!ctx) throw new Error("Canvas 2D indisponível");

  const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

  await page.render({
    canvasContext: ctx,
    viewport,
    transform,
  }).promise;

  return {
    pageNumber,
    rotation,
    width: viewport.width,
    height: viewport.height,
    scale: baseScale,
    outputScale,
    /** CSS pixel size of the rendered page */
    cssWidth: viewport.width,
    cssHeight: viewport.height,
  };
}

export function fitBaseScale(pdfPageViewportWidth, pdfPageViewportHeight, stageWidth, stageHeight, padding = 16) {
  const availW = Math.max(120, stageWidth - padding * 2);
  const availH = Math.max(120, stageHeight - padding * 2);
  return Math.min(availW / pdfPageViewportWidth, availH / pdfPageViewportHeight);
}
