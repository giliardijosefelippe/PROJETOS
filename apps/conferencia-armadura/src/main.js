import "./styles.css";
import { createAnnotationStore, paintAnnotations } from "./annotations.js";
import { loadPdf, renderPage } from "./pdf-engine.js";
import {
  buildExportableHtmlDocument,
  buildPlainTextReport,
  buildReportModel,
  renderReportHtmlFragment,
} from "./report.js";
import { bindWakeVisibility, isWakeEnabled, setWakeEnabled } from "./wake-lock.js";

const DEMO_PDF = "./pdfs/demo-pilares-vigas.pdf";
const DEMO_LABEL = "2330_GAR PILARES E VIGAS — Sanluzzi Selenza Rev01";

const els = {
  viewport: document.getElementById("viewport"),
  scene: document.getElementById("scene"),
  pdfCanvas: document.getElementById("pdf-canvas"),
  annoCanvas: document.getElementById("anno-canvas"),
  hint: document.getElementById("hint"),
  docLabel: document.getElementById("doc-label"),
  btnWake: document.getElementById("btn-wake"),
  btnRotate: document.getElementById("btn-rotate"),
  btnUndo: document.getElementById("btn-undo"),
  btnClear: document.getElementById("btn-clear"),
  btnDemo: document.getElementById("btn-demo"),
  btnReport: document.getElementById("btn-report"),
  btnReportTop: document.getElementById("btn-report-top"),
  fileInput: document.getElementById("file-input"),
  reportPanel: document.getElementById("report-panel"),
  reportBody: document.getElementById("report-body"),
  btnCloseReport: document.getElementById("btn-close-report"),
  btnExportHtml: document.getElementById("btn-export-html"),
  btnExportText: document.getElementById("btn-export-text"),
  btnShare: document.getElementById("btn-share"),
  textModal: document.getElementById("text-modal"),
  textInput: document.getElementById("text-input"),
  textModalTitle: document.getElementById("text-modal-title"),
  btnTextCancel: document.getElementById("btn-text-cancel"),
  btnTextOk: document.getElementById("btn-text-ok"),
  tools: [...document.querySelectorAll(".tool[data-tool]")],
};

const state = {
  tool: "pan",
  /** last content mode for stroke/arrow/note coloring */
  contentMode: "risk",
  pdf: null,
  docName: DEMO_LABEL,
  pageInfo: null,
  rotation: 0,
  /** CSS view rotation (90° steps) — keeps annotations aligned */
  viewRotation: 0,
  /** world transform of the scene */
  scale: 1,
  tx: 0,
  ty: 0,
  pointers: new Map(),
  pinching: false,
  drawing: false,
  panStart: null,
  notePending: null,
  lastReportModel: null,
};

const annotations = createAnnotationStore();

function setHint(text) {
  if (!text) {
    els.hint.hidden = true;
    els.hint.textContent = "";
    return;
  }
  els.hint.hidden = false;
  els.hint.textContent = text;
}

function applySceneTransform() {
  const rot = state.viewRotation || 0;
  const pw = state.pageInfo?.cssWidth || 0;
  const ph = state.pageInfo?.cssHeight || 0;
  const cx = pw / 2;
  const cy = ph / 2;
  // Explicit origin math: pan/zoom around viewport, rotate around page center.
  els.scene.style.transformOrigin = "0 0";
  els.scene.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale}) translate(${cx}px, ${cy}px) rotate(${rot}deg) translate(${-cx}px, ${-cy}px)`;
}

function syncAnnoCanvas() {
  if (!state.pageInfo) return;
  const { cssWidth, cssHeight } = state.pageInfo;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  els.annoCanvas.width = Math.floor(cssWidth * dpr);
  els.annoCanvas.height = Math.floor(cssHeight * dpr);
  els.annoCanvas.style.width = `${cssWidth}px`;
  els.annoCanvas.style.height = `${cssHeight}px`;
  const ctx = els.annoCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawAnnotations();
}

function redrawAnnotations() {
  const ctx = els.annoCanvas.getContext("2d");
  if (!ctx || !state.pageInfo) return;
  // Annotations are stored in rendered CSS-pixel page space (already includes baseScale & rotation of the page render)
  paintAnnotations(ctx, annotations.list(), 1, annotations.getDraft());
}

function setTool(tool) {
  state.tool = tool;
  if (tool === "ok") state.contentMode = "ok";
  if (tool === "risk") state.contentMode = "risk";
  els.tools.forEach((btn) => {
    btn.setAttribute("aria-pressed", String(btn.dataset.tool === tool));
  });
}

function clientToPage(clientX, clientY) {
  const rect = els.viewport.getBoundingClientRect();
  const vx = clientX - rect.left;
  const vy = clientY - rect.top;
  const pw = state.pageInfo?.cssWidth || 0;
  const ph = state.pageInfo?.cssHeight || 1;
  const cx = pw / 2;
  const cy = ph / 2;
  // Inverse of translate(tx,ty) scale(s) translate(cx,cy) rotate(r) translate(-cx,-cy)
  const lx = (vx - state.tx) / state.scale;
  const ly = (vy - state.ty) / state.scale;
  const dx = lx - cx;
  const dy = ly - cy;
  const rad = (-(state.viewRotation || 0) * Math.PI) / 180;
  const x = cx + dx * Math.cos(rad) - dy * Math.sin(rad);
  const y = cy + dx * Math.sin(rad) + dy * Math.cos(rad);
  return { x, y };
}

function centerPage() {
  if (!state.pageInfo) return;
  const vw = els.viewport.clientWidth;
  const vh = els.viewport.clientHeight;
  const pw = state.pageInfo.cssWidth;
  const ph = state.pageInfo.cssHeight;
  const rotated = Math.abs(state.viewRotation % 180) === 90;
  const visualW = rotated ? ph : pw;
  const visualH = rotated ? pw : ph;
  state.scale = Math.min(vw / visualW, vh / visualH) * 0.96;
  // With transform-origin at page center, translation positions the unrotated top-left;
  // after rotate around center, the visual AABB center should match the viewport center.
  state.tx = vw / 2 - (pw / 2) * state.scale;
  state.ty = vh / 2 - (ph / 2) * state.scale;
  applySceneTransform();
}

async function openPdfSource(source, label) {
  setHint("Carregando prancha…");
  try {
    let pdfSource = source;
    if (typeof source === "string") {
      const res = await fetch(source);
      if (!res.ok) throw new Error(`HTTP ${res.status} ao buscar PDF`);
      const buffer = await res.arrayBuffer();
      pdfSource = { data: new Uint8Array(buffer) };
    }
    state.pdf = await loadPdf(pdfSource);
    state.docName = label;
    els.docLabel.textContent = label;
    annotations.clear();
    state.rotation = 0;
    state.viewRotation = 0;
    await rerender();
    centerPage();
    setHint("Toque: marque OK / risco na prancha. Dois dedos: zoom.");
    setTimeout(() => setHint(""), 2800);
  } catch (err) {
    console.error(err);
    setHint("Falha ao abrir o PDF. Tente outro arquivo.");
  }
}

async function rerender() {
  if (!state.pdf) return;
  state.pageInfo = await renderPage(state.pdf, els.pdfCanvas, {
    pageNumber: 1,
    baseScale: 1.75,
    rotation: state.rotation,
  });
  els.scene.style.width = `${state.pageInfo.cssWidth}px`;
  els.scene.style.height = `${state.pageInfo.cssHeight}px`;
  syncAnnoCanvas();
}

function startStroke(point) {
  annotations.setDraft({
    kind: "stroke",
    mode: state.contentMode,
    width: 3,
    points: [point],
  });
  state.drawing = true;
  redrawAnnotations();
}

function extendStroke(point) {
  const draft = annotations.getDraft();
  if (!draft || draft.kind !== "stroke") return;
  const pts = draft.points;
  const last = pts[pts.length - 1];
  if (!last || Math.hypot(point.x - last.x, point.y - last.y) < 1.2) return;
  pts.push(point);
  redrawAnnotations();
}

function endStroke() {
  const draft = annotations.getDraft();
  if (draft?.kind === "stroke" && draft.points?.length > 1) {
    annotations.commitDraft();
  } else {
    annotations.setDraft(null);
  }
  state.drawing = false;
  redrawAnnotations();
}

function placeStamp(kind, point) {
  annotations.add({ kind, x: point.x, y: point.y });
  redrawAnnotations();
}

function startArrow(point) {
  annotations.setDraft({
    kind: "arrow",
    mode: state.contentMode,
    x1: point.x,
    y1: point.y,
    x2: point.x,
    y2: point.y,
  });
  state.drawing = true;
  redrawAnnotations();
}

function updateArrow(point) {
  const draft = annotations.getDraft();
  if (!draft || draft.kind !== "arrow") return;
  draft.x2 = point.x;
  draft.y2 = point.y;
  redrawAnnotations();
}

function endArrow() {
  const draft = annotations.getDraft();
  if (draft?.kind === "arrow") {
    const len = Math.hypot(draft.x2 - draft.x1, draft.y2 - draft.y1);
    if (len > 8) annotations.commitDraft();
    else annotations.setDraft(null);
  }
  state.drawing = false;
  redrawAnnotations();
}

function openNoteModal(point) {
  state.notePending = point;
  els.textModalTitle.textContent =
    state.contentMode === "ok" ? "Nota OK no PDF" : "Nota de risco no PDF";
  els.textInput.value = "";
  els.textModal.hidden = false;
  setTimeout(() => els.textInput.focus(), 50);
}

function closeNoteModal() {
  els.textModal.hidden = true;
  state.notePending = null;
}

function saveNote() {
  const text = els.textInput.value.trim();
  if (!text || !state.notePending) {
    closeNoteModal();
    return;
  }
  annotations.add({
    kind: "note",
    mode: state.contentMode,
    x: state.notePending.x,
    y: state.notePending.y,
    text,
  });
  closeNoteModal();
  redrawAnnotations();
}

function onPointerDown(e) {
  // Only capture while interacting on the viewport so toolbar clicks stay clickable.
  try {
    els.viewport.setPointerCapture?.(e.pointerId);
  } catch {
    /* ignore */
  }
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (state.pointers.size === 2) {
    state.pinching = true;
    state.drawing = false;
    annotations.setDraft(null);
    const [a, b] = [...state.pointers.values()];
    state.pinch = {
      dist: Math.hypot(a.x - b.x, a.y - b.y),
      scale: state.scale,
      midX: (a.x + b.x) / 2,
      midY: (a.y + b.y) / 2,
      tx: state.tx,
      ty: state.ty,
    };
    return;
  }

  if (state.tool === "pan" || e.button === 1) {
    state.panStart = { x: e.clientX, y: e.clientY, tx: state.tx, ty: state.ty };
    return;
  }

  const point = clientToPage(e.clientX, e.clientY);
  if (state.tool === "stroke") startStroke(point);
  else if (state.tool === "arrow") startArrow(point);
  else if (state.tool === "ok") placeStamp("ok", point);
  else if (state.tool === "risk") placeStamp("risk", point);
  else if (state.tool === "note") openNoteModal(point);
}

function onPointerMove(e) {
  if (!state.pointers.has(e.pointerId)) return;
  state.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (state.pinching && state.pointers.size >= 2) {
    const [a, b] = [...state.pointers.values()];
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const ratio = dist / Math.max(1, state.pinch.dist);
    const nextScale = clamp(state.pinch.scale * ratio, 0.35, 8);
    const rect = els.viewport.getBoundingClientRect();
    const localMidX = midX - rect.left;
    const localMidY = midY - rect.top;
    const worldX = (localMidX - state.pinch.tx) / state.pinch.scale;
    const worldY = (localMidY - state.pinch.ty) / state.pinch.scale;
    state.scale = nextScale;
    state.tx = localMidX - worldX * nextScale;
    state.ty = localMidY - worldY * nextScale;
    applySceneTransform();
    return;
  }

  if (state.panStart && state.tool === "pan") {
    state.tx = state.panStart.tx + (e.clientX - state.panStart.x);
    state.ty = state.panStart.ty + (e.clientY - state.panStart.y);
    applySceneTransform();
    return;
  }

  if (!state.drawing) return;
  const point = clientToPage(e.clientX, e.clientY);
  if (state.tool === "stroke") extendStroke(point);
  if (state.tool === "arrow") updateArrow(point);
}

function onPointerUp(e) {
  state.pointers.delete(e.pointerId);
  if (state.pointers.size < 2) state.pinching = false;
  if (state.pointers.size === 0) state.panStart = null;

  if (state.drawing) {
    if (state.tool === "stroke") endStroke();
    if (state.tool === "arrow") endArrow();
  }

  try {
    if (els.viewport.hasPointerCapture?.(e.pointerId)) {
      els.viewport.releasePointerCapture(e.pointerId);
    }
  } catch {
    /* ignore */
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function onWheel(e) {
  e.preventDefault();
  const rect = els.viewport.getBoundingClientRect();
  const localX = e.clientX - rect.left;
  const localY = e.clientY - rect.top;
  const worldX = (localX - state.tx) / state.scale;
  const worldY = (localY - state.ty) / state.scale;
  const factor = e.deltaY < 0 ? 1.12 : 0.9;
  state.scale = clamp(state.scale * factor, 0.35, 8);
  state.tx = localX - worldX * state.scale;
  state.ty = localY - worldY * state.scale;
  applySceneTransform();
}

async function updateWakeUi() {
  const on = isWakeEnabled();
  els.btnWake.classList.toggle("on", on);
  els.btnWake.setAttribute("aria-pressed", String(on));
  els.btnWake.textContent = on ? "Tela ligada" : "Tela pode apagar";
}

async function toggleWake() {
  const next = !isWakeEnabled();
  const result = await setWakeEnabled(next);
  await updateWakeUi();
  if (next && !result.ok) {
    setHint("Wake Lock indisponível neste navegador. No APK use Keep Awake.");
    setTimeout(() => setHint(""), 3200);
  }
}

async function rotateView() {
  state.viewRotation = (state.viewRotation + 90) % 360;
  applySceneTransform();
  // Re-center so the rotated page stays usable on a phone.
  centerPage();
  setHint(`Visualização ${state.viewRotation}°`);
  setTimeout(() => setHint(""), 1200);
}

function openReport(event) {
  try {
    event?.preventDefault?.();
  } catch {
    /* ignore */
  }
  try {
    const panel = document.getElementById("report-panel");
    const body = document.getElementById("report-body");
    const model = buildReportModel(state.docName, annotations);
    state.lastReportModel = model;
    if (body) body.innerHTML = renderReportHtmlFragment(model);
    if (panel) {
      panel.hidden = false;
      panel.removeAttribute("hidden");
      panel.style.display = "flex";
    }
    setHint("");
  } catch (err) {
    console.error(err);
    setHint("Não foi possível montar o relatório.");
    setTimeout(() => setHint(""), 2500);
  }
}

function closeReport() {
  const panel = document.getElementById("report-panel");
  if (!panel) return;
  panel.hidden = true;
  panel.setAttribute("hidden", "");
  panel.style.display = "none";
}

// Expose for inline onclick (reliable on mobile WebViews / automation)
window.__openConfReport = openReport;
window.__closeConfReport = closeReport;

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function exportHtml() {
  if (!state.lastReportModel) openReport();
  const html = buildExportableHtmlDocument(state.lastReportModel);
  downloadBlob(
    `relatorio-conferencia-armadura-${Date.now()}.html`,
    new Blob([html], { type: "text/html;charset=utf-8" })
  );
}

async function copyText() {
  if (!state.lastReportModel) openReport();
  const text = buildPlainTextReport(state.lastReportModel);
  try {
    await navigator.clipboard.writeText(text);
    setHint("Relatório copiado.");
  } catch {
    // fallback prompt
    window.prompt("Copie o relatório:", text);
  }
  setTimeout(() => setHint(""), 1800);
}

async function shareReport() {
  if (!state.lastReportModel) openReport();
  const text = buildPlainTextReport(state.lastReportModel);
  if (navigator.share) {
    try {
      await navigator.share({ title: "Relatório Conf. Armadura", text });
      return;
    } catch {
      /* user cancelled or failed */
    }
  }
  await copyText();
}

function bindUi() {
  els.tools.forEach((btn) => {
    btn.addEventListener("click", () => setTool(btn.dataset.tool));
  });

  els.btnWake.addEventListener("click", toggleWake);
  els.btnRotate.addEventListener("click", rotateView);
  els.btnUndo.addEventListener("click", () => {
    annotations.undo();
    redrawAnnotations();
  });
  els.btnClear.addEventListener("click", () => {
    if (!annotations.list().length) return;
    if (window.confirm("Limpar todas as marcações desta conferência?")) {
      annotations.clear();
      redrawAnnotations();
    }
  });
  els.btnDemo.addEventListener("click", () => openPdfSource(DEMO_PDF, DEMO_LABEL));
  els.btnCloseReport.addEventListener("click", closeReport);
  document.addEventListener("click", (e) => {
    const t = e.target instanceof Element ? e.target.closest("#btn-report, #btn-report-top") : null;
    if (t) openReport(e);
  });
  els.btnExportHtml.addEventListener("click", exportHtml);
  els.btnExportText.addEventListener("click", copyText);
  els.btnShare.addEventListener("click", shareReport);
  els.btnTextCancel.addEventListener("click", closeNoteModal);
  els.btnTextOk.addEventListener("click", saveNote);

  els.fileInput.addEventListener("change", async () => {
    const file = els.fileInput.files?.[0];
    if (!file) return;
    const buffer = await file.arrayBuffer();
    await openPdfSource({ data: new Uint8Array(buffer) }, file.name);
    els.fileInput.value = "";
  });

  els.viewport.addEventListener("pointerdown", onPointerDown);
  els.viewport.addEventListener("pointermove", onPointerMove);
  els.viewport.addEventListener("pointerup", onPointerUp);
  els.viewport.addEventListener("pointercancel", onPointerUp);
  els.viewport.addEventListener("wheel", onWheel, { passive: false });

  window.addEventListener("resize", () => {
    if (state.pageInfo) centerPage();
  });
}

async function boot() {
  bindUi();
  bindWakeVisibility();
  setTool("pan");

  // Do not block PDF load on Wake Lock (can hang or fail in some environments).
  setWakeEnabled(true)
    .then(() => updateWakeUi())
    .catch(() => updateWakeUi());

  await openPdfSource(DEMO_PDF, DEMO_LABEL);

  if ("serviceWorker" in navigator) {
    try {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.update().catch(() => {})));
      await navigator.serviceWorker.register("./sw.js?v=2");
    } catch {
      /* optional offline helper */
    }
  }
}

boot();
