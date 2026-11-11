/**
 * Capacitor/Android safety patches around Prumo PdfViewer (pdf-view.js untouched).
 *
 * Freeze causes addressed:
 * 1) ESM pdf.worker.js via Worker({type:"module"}) can hang forever in WebView
 *    (no error → no FakeWorker fallback). Prefer same-origin Blob workerSrc;
 *    on timeout, force FakeWorker by making `new Worker` throw.
 * 2) paintBudget up to ~3.6M px on coarse pointers can stall the main thread
 *    on large engineering sheets.
 */
import { PdfViewer } from "./prumo/pdf-view.js";

const PDF_JS = new URL("./prumo/vendor/pdf/pdf.js", import.meta.url).href;
const PDF_WORKER = new URL("./prumo/vendor/pdf/pdf.worker.js", import.meta.url).href;

let workerBlobUrl = null;
let pdfLibPromise = null;
let patched = false;

export function isNativeCapacitor() {
  try {
    return !!(globalThis.Capacitor?.isNativePlatform?.() || /android|capacitor/i.test(navigator.userAgent || ""));
  } catch {
    return false;
  }
}

async function ensureWorkerBlob() {
  if (workerBlobUrl) return workerBlobUrl;
  const res = await fetch(PDF_WORKER);
  if (!res.ok) throw new Error("Worker PDF ausente (" + res.status + ")");
  const code = await res.text();
  workerBlobUrl = URL.createObjectURL(new Blob([code], { type: "text/javascript" }));
  return workerBlobUrl;
}

async function loadPdfLib() {
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = (async () => {
    const lib = await import(PDF_JS);
    lib.GlobalWorkerOptions.workerSrc = await ensureWorkerBlob();
    return lib;
  })();
  try {
    return await pdfLibPromise;
  } catch (err) {
    pdfLibPromise = null;
    throw err;
  }
}

function installPrumoAssetOverride() {
  const prev = globalThis.PrumoAssets;
  globalThis.PrumoAssets = new Proxy(
    {},
    {
      get(_t, path) {
        if (typeof path !== "string") return undefined;
        if (path === "./vendor/pdf/pdf.worker.js" && workerBlobUrl) return workerBlobUrl;
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

function installPaintBudgetPatch() {
  PdfViewer.prototype.paintBudget = function paintBudget(sharp) {
    const coarse = matchMedia("(pointer:coarse)").matches || navigator.maxTouchPoints > 1;
    if (isNativeCapacitor()) {
      return sharp ? (coarse ? 1_400_000 : 2_200_000) : coarse ? 420_000 : 720_000;
    }
    return sharp ? (coarse ? 2_400_000 : 4_000_000) : coarse ? 800_000 : 1_400_000;
  };
}

function withTimeout(promise, ms, label) {
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
 * Patch PdfViewer.open once: Blob workerSrc, open timeout, FakeWorker retry.
 */
export function patchPdfViewerForAndroid() {
  if (patched) return;
  patched = true;
  installPrumoAssetOverride();
  installPaintBudgetPatch();

  const originalOpen = PdfViewer.prototype.open;
  PdfViewer.prototype.open = async function openSafe(file) {
    const lib = await loadPdfLib();
    this.lib = lib;
    lib.GlobalWorkerOptions.workerSrc = await ensureWorkerBlob();

    const budgetMs = isNativeCapacitor() ? 28000 : 60000;
    const run = (forceFake) => {
      const exec = () => originalOpen.call(this, file);
      return forceFake ? withForcedFakeWorker(exec) : exec();
    };

    try {
      await withTimeout(run(false), budgetMs, "Timeout ao abrir PDF (worker)");
      return;
    } catch (err) {
      console.warn("[pdf-android-safe] retry FakeWorker", err);
      try {
        await this.close();
      } catch {}
      lib.GlobalWorkerOptions.workerSrc = await ensureWorkerBlob();
      await withTimeout(run(true), budgetMs, "Timeout ao abrir PDF (fake worker)");
    }
  };
}

export { PdfViewer, loadPdfLib, ensureWorkerBlob };
