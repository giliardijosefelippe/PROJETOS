/**
 * Safety layer around Prumo PdfViewer (pdf-view.js untouched).
 *
 * - workerSrc MUST be a real same-origin URL (never Blob ESM — breaks import.meta.url).
 * - Prefer real module Worker so parse/render stay off the main thread (UI stays alive).
 * - Short timeout + close(); FakeWorker only as explicit fallback after failure.
 */
import { PdfViewer } from "./prumo/pdf-view.js";

const PDF_JS = new URL("./prumo/vendor/pdf/pdf.js", import.meta.url).href;
const PDF_WORKER = new URL("./prumo/vendor/pdf/pdf.worker.js", import.meta.url).href;

/** Soft open budget — keep UI recoverable (Cancel works while Worker runs). */
export const OPEN_TIMEOUT_MS = 5000;

let pdfLibPromise = null;
let patched = false;

export function isNativeCapacitor() {
  try {
    return !!(globalThis.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
}

export function workerSrcUrl() {
  return PDF_WORKER;
}

function installPrumoAssetOverride() {
  const prev = globalThis.PrumoAssets;
  globalThis.PrumoAssets = new Proxy(
    {},
    {
      get(_t, path) {
        if (typeof path !== "string") return undefined;
        if (path === "./vendor/pdf/pdf.worker.js") return PDF_WORKER;
        if (path === "./vendor/pdf/pdf.js") return PDF_JS;
        if (path.startsWith("./vendor/pdf/")) {
          return new URL("prumo/vendor/pdf/" + path.slice("./vendor/pdf/".length), import.meta.url).href;
        }
        if (prev && typeof prev === "object" && path in prev) return prev[path];
        return undefined;
      },
    }
  );
}

export async function loadPdfLib() {
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = (async () => {
    const lib = await import(PDF_JS);
    // Never Blob — real URL only.
    if (typeof PDF_WORKER === "string" && PDF_WORKER.startsWith("blob:")) {
      throw new Error("workerSrc inválido (blob)");
    }
    lib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
    return lib;
  })();
  try {
    return await pdfLibPromise;
  } catch (err) {
    pdfLibPromise = null;
    throw err;
  }
}

function installPaintBudgetPatch() {
  PdfViewer.prototype.paintBudget = function paintBudget(sharp) {
    const coarse = matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 1;
    if (isNativeCapacitor()) {
      return sharp ? (coarse ? 900_000 : 1_400_000) : coarse ? 280_000 : 480_000;
    }
    return sharp ? (coarse ? 2_000_000 : 3_200_000) : coarse ? 700_000 : 1_100_000;
  };
}

export function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, rej) => {
    timer = setTimeout(() => rej(new Error(label || "Timeout")), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function withForcedFakeWorker(fn) {
  const RealWorker = globalThis.Worker;
  function ThrowingWorker() {
    throw new Error("force-fake-worker");
  }
  ThrowingWorker.prototype = RealWorker.prototype;
  globalThis.Worker = ThrowingWorker;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      globalThis.Worker = RealWorker;
    });
}

/**
 * Real Worker first (keeps main thread free). On fail/timeout → FakeWorker once.
 */
export function patchPdfViewerForAndroid() {
  if (patched) return;
  patched = true;
  installPrumoAssetOverride();
  installPaintBudgetPatch();

  const originalOpen = PdfViewer.prototype.open;
  PdfViewer.prototype.open = async function openSafe(file, opts = {}) {
    const lib = await loadPdfLib();
    this.lib = lib;
    lib.GlobalWorkerOptions.workerSrc = PDF_WORKER;

    const budgetMs = opts.timeoutMs ?? OPEN_TIMEOUT_MS;
    const preferFake = !!opts.forceFakeWorker;
    const run = (forceFake) => {
      const exec = () => originalOpen.call(this, file);
      return forceFake ? withForcedFakeWorker(exec) : exec();
    };

    try {
      await withTimeout(run(preferFake), budgetMs, "Timeout ao abrir PDF (" + budgetMs + "ms)");
      return { mode: preferFake ? "fake" : "worker" };
    } catch (err) {
      console.warn("[pdf-safe] open failed, retry alternate worker mode", err);
      try {
        await this.close();
      } catch {}
      lib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      const altFake = !preferFake;
      await withTimeout(run(altFake), budgetMs, "Timeout ao abrir PDF (fallback)");
      return { mode: altFake ? "fake" : "worker" };
    }
  };
}

export { PdfViewer, PDF_WORKER, PDF_JS };
