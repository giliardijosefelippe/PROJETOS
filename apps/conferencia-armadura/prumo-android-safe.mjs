/**
 * Safety layer around Prumo PdfViewer (pdf-view.js untouched).
 *
 * Root hang: Blob URL + ESM worker. pdf.worker.js uses import.meta.url; as a
 * blob module that resolution breaks and Worker({type:"module"}) never answers
 * "test" → getDocument hangs forever ("Abrindo…") on desktop and Capacitor.
 *
 * Fix: keep workerSrc as a real same-origin URL. If the module Worker hangs or
 * native WebView is flaky, force FakeWorker (main-thread) by making `new Worker`
 * throw so pdf.js falls back while still `import(workerSrc)` from the real URL.
 */
import { PdfViewer } from "./prumo/pdf-view.js";

const PDF_JS = new URL("./prumo/vendor/pdf/pdf.js", import.meta.url).href;
const PDF_WORKER = new URL("./prumo/vendor/pdf/pdf.worker.js", import.meta.url).href;

let pdfLibPromise = null;
let patched = false;

export function isNativeCapacitor() {
  try {
    return !!(globalThis.Capacitor?.isNativePlatform?.());
  } catch {
    return false;
  }
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

async function loadPdfLib() {
  if (pdfLibPromise) return pdfLibPromise;
  pdfLibPromise = (async () => {
    const lib = await import(PDF_JS);
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
      return sharp ? (coarse ? 1_400_000 : 2_200_000) : coarse ? 420_000 : 720_000;
    }
    return sharp ? (coarse ? 2_800_000 : 4_500_000) : coarse ? 900_000 : 1_500_000;
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
 * Patch open: real worker URL; short hang timeout → FakeWorker retry.
 * On Capacitor, start with FakeWorker (module Worker often hangs in WebView).
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
    lib.GlobalWorkerOptions.workerSrc = PDF_WORKER;

    const native = isNativeCapacitor();
    const budgetMs = native ? 45000 : 25000;

    const run = (forceFake) => {
      const exec = () => originalOpen.call(this, file);
      return forceFake ? withForcedFakeWorker(exec) : exec();
    };

    // Native: FakeWorker first (reliable). Desktop: real Worker, then FakeWorker.
    if (native) {
      try {
        await withTimeout(run(true), budgetMs, "Timeout ao abrir PDF");
        return;
      } catch (err) {
        console.warn("[pdf-safe] native FakeWorker failed, retry real Worker", err);
        try {
          await this.close();
        } catch {}
        lib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
        await withTimeout(run(false), budgetMs, "Timeout ao abrir PDF (worker)");
        return;
      }
    }

    try {
      await withTimeout(run(false), budgetMs, "Timeout ao abrir PDF (worker)");
    } catch (err) {
      console.warn("[pdf-safe] Worker hung/failed — FakeWorker retry", err);
      try {
        await this.close();
      } catch {}
      lib.GlobalWorkerOptions.workerSrc = PDF_WORKER;
      await withTimeout(run(true), budgetMs, "Timeout ao abrir PDF (fake worker)");
    }
  };
}

export { PdfViewer, loadPdfLib, PDF_WORKER, PDF_JS };
