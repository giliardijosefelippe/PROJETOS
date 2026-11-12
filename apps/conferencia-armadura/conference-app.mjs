/**
 * Conf. Armadura — PdfViewer (Prumo) + conference overlay.
 * Imports prumo/pdf-view.js as-is; annotations track scale/x/y/rotation.
 * Worker: real URL + timeout/cancel (prumo-android-safe; pdf-view untouched).
 */
import {
  PdfViewer,
  patchPdfViewerForAndroid,
  isNativeCapacitor,
  OPEN_TIMEOUT_MS,
  loadPdfLib,
  workerSrcUrl,
} from "./prumo-android-safe.mjs";

patchPdfViewerForAndroid();

/** App revision shown in header / Sobre (keep in sync with Android versionName). */
export const APP_VERSION = "1.0.3";
export const APP_REVISION_LABEL = "Revisão 1.0.3";
export const APP_VERSION_CODE = 103;

const DEMO_PDF = "demo-pilares-vigas.pdf";
const DEMO_LABEL = "2330_GAR PILARES E VIGAS — Sanluzzi Selenza Rev01";
const LIB_INDEX_KEY = "conf-armadura-library-v1";
const LIB_FOLDER = "Download/ConfArmadura";
const IDB_NAME = "conf-armadura-db";
const IDB_STORE = "pdfs";
const ANNO_CANVAS_BUDGET = 1_600_000;

const $ = (id) => document.getElementById(id);
const els = {
  pdf: $("pdf"),
  viewport: $("viewport"),
  annoLayer: $("anno-layer"),
  annoCanvas: $("anno-canvas"),
  selectPreview: $("select-preview"),
  hint: $("hint"),
  hintMsg: $("hint-msg"),
  hintActions: $("hint-actions"),
  btnHintCancel: $("btn-hint-cancel"),
  docLabel: $("doc-label"),
  zoom: $("zoom"),
  pdfPage: $("pdf-page"),
  pdfTotal: $("pdf-total"),
  pdfResults: $("pdf-results"),
  pdfQuery: $("pdf-query"),
  reportPanel: $("report-panel"),
  reportBody: $("report-body"),
  libraryPanel: $("library-panel"),
  libraryBody: $("library-body"),
  textModal: $("text-modal"),
  textInput: $("text-input"),
  textModalTitle: $("text-modal-title"),
  autosaveChip: $("autosave-chip"),
  fileInput: $("file-input"),
  fileInputLibrary: $("file-input-library"),
  tools: [...document.querySelectorAll(".tool[data-tool]")],
};

const state = {
  tool: "pan",
  contentMode: "risk",
  docId: "",
  docName: "",
  pdfBytes: null,
  pageW: 1,
  pageH: 1,
  drawing: false,
  draft: null,
  notePending: null,
  riskPending: null,
  modalMode: "note",
  lastReportModel: null,
  textItems: [],
  textItemsPage: 0,
  wakeEnabled: true,
  wakeLock: null,
};

let annotations = [];
let pdfViewer = null;
let autosaveTimer = 0;
let syncRaf = 0;
/** Bumps on cancel/new open — ignore stale open completions. */
let openGeneration = 0;
let openBusy = false;
let openWatchdog = 0;

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : "id-" + Date.now().toString(36);
}

function setHint(text, opts = {}) {
  const busy = !!opts.busy;
  const cancellable = !!opts.cancellable;
  if (!text) {
    els.hint.hidden = true;
    els.hint.classList.remove("busy");
    if (els.hintMsg) els.hintMsg.textContent = "";
    if (els.hintActions) els.hintActions.hidden = true;
    return;
  }
  els.hint.hidden = false;
  els.hint.classList.toggle("busy", busy || cancellable);
  if (els.hintMsg) els.hintMsg.textContent = text;
  else els.hint.textContent = text;
  if (els.hintActions) els.hintActions.hidden = !cancellable;
}

function cancelOpen(reason) {
  openGeneration += 1;
  openBusy = false;
  clearTimeout(openWatchdog);
  openWatchdog = 0;
  try {
    pdfViewer?.close?.();
  } catch {}
  setHint(reason || "Abertura cancelada. Use 📄 Importar ou Demo.", { busy: false, cancellable: false });
  setTimeout(() => {
    if (!openBusy) setHint("Pronto · 📄 Importar · 📚 Biblioteca · Demo");
  }, 2200);
}

function flashAutosave() {
  const chip = els.autosaveChip;
  if (!chip) return;
  chip.classList.add("on");
  clearTimeout(flashAutosave._t);
  flashAutosave._t = setTimeout(() => chip.classList.remove("on"), 1200);
}

function annotsKey(docId) {
  return "conf-armadura-annots:" + docId;
}

function makeDocId(name, bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return `${name || "pdf"}|${u8.byteLength}|${u8[0] || 0}-${u8[100] || 0}`;
}

function loadAnnots(docId) {
  try {
    const list = JSON.parse(localStorage.getItem(annotsKey(docId)) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function scheduleAutosave() {
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => {
    if (!state.docId) return;
    try {
      localStorage.setItem(annotsKey(state.docId), JSON.stringify(annotations));
      flashAutosave();
      mirrorNativeAnnots().catch(() => {});
    } catch (e) {
      console.warn(e);
    }
  }, 280);
}

function isNative() {
  try {
    return !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());
  } catch {
    return false;
  }
}

function capFs() {
  try {
    return window.Capacitor?.Plugins?.Filesystem || null;
  } catch {
    return null;
  }
}

function bytesToBase64(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunk = 0x2000;
  let s = "";
  for (let i = 0; i < u8.length; i += chunk) {
    s += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  }
  return btoa(s);
}

function base64ToBytes(b64) {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, value) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, "readwrite");
    tx.objectStore(IDB_STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGet(key) {
  const db = await openIdb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

function readLibraryIndex() {
  try {
    const parsed = JSON.parse(localStorage.getItem(LIB_INDEX_KEY) || '{"pdfs":[]}');
    return parsed?.pdfs ? parsed : { pdfs: [] };
  } catch {
    return { pdfs: [] };
  }
}

function writeLibraryIndex(index) {
  localStorage.setItem(LIB_INDEX_KEY, JSON.stringify(index));
}

async function mirrorNativeAnnots() {
  const fs = capFs();
  if (!fs || !isNative() || !state.docId || !state.pdfBytes) return;
  const index = readLibraryIndex();
  const entry = index.pdfs.find((p) => p.id === state.docId);
  if (!entry) return;
  const stem = String(entry.name || "prancha").replace(/\.pdf$/i, "").replace(/[^\w.\-À-ÿ]+/g, "_").slice(0, 80) || "prancha";
  const dirs = [
    { directory: "EXTERNAL_STORAGE", folder: LIB_FOLDER },
    { directory: "DOCUMENTS", folder: "ConfArmadura" },
    { directory: "DATA", folder: "ConfArmadura" },
  ];
  const pdfData = bytesToBase64(state.pdfBytes);
  const jsonData = bytesToBase64(new TextEncoder().encode(JSON.stringify(annotations)));
  for (const dir of dirs) {
    try {
      try {
        await fs.mkdir({ path: dir.folder, directory: dir.directory, recursive: true });
      } catch {}
      await fs.writeFile({ path: `${dir.folder}/${stem}.pdf`, data: pdfData, directory: dir.directory, recursive: true });
      await fs.writeFile({
        path: `${dir.folder}/${stem}.annots.json`,
        data: jsonData,
        directory: dir.directory,
        recursive: true,
      });
      entry.nativeDirectory = dir.directory;
      entry.nativePdfPath = `${dir.folder}/${stem}.pdf`;
      entry.nativeAnnotsPath = `${dir.folder}/${stem}.annots.json`;
      writeLibraryIndex(index);
      return;
    } catch {}
  }
}

async function savePdfToLibrary(bytes, name, docId) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const index = readLibraryIndex();
  let entry = index.pdfs.find((p) => p.id === docId);
  if (!entry) {
    entry = { id: docId, name: name || "prancha.pdf", size: u8.byteLength, importedAt: new Date().toISOString() };
    index.pdfs.unshift(entry);
  }
  entry.name = name || entry.name;
  entry.size = u8.byteLength;
  entry.updatedAt = new Date().toISOString();
  try {
    await idbPut(docId, { id: docId, name: entry.name, bytes: u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) });
  } catch (e) {
    console.warn(e);
  }
  writeLibraryIndex(index);
  state.pdfBytes = u8;
  await mirrorNativeAnnots();
  renderLibraryList();
}

async function loadPdfFromLibrary(docId) {
  try {
    const row = await idbGet(docId);
    if (row?.bytes) return { bytes: new Uint8Array(row.bytes), name: row.name };
  } catch {}
  const entry = readLibraryIndex().pdfs.find((p) => p.id === docId);
  if (entry?.nativePdfPath && capFs()) {
    const res = await capFs().readFile({
      path: entry.nativePdfPath,
      directory: entry.nativeDirectory || "EXTERNAL_STORAGE",
    });
    return { bytes: base64ToBytes(res.data), name: entry.name };
  }
  throw new Error("PDF não encontrado na biblioteca");
}

async function removeFromLibrary(docId) {
  const index = readLibraryIndex();
  const entry = index.pdfs.find((p) => p.id === docId);
  index.pdfs = index.pdfs.filter((p) => p.id !== docId);
  writeLibraryIndex(index);
  localStorage.removeItem(annotsKey(docId));
  try {
    const db = await openIdb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, "readwrite");
      tx.objectStore(IDB_STORE).delete(docId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {}
  if (entry?.nativePdfPath && capFs()) {
    try {
      await capFs().deleteFile({ path: entry.nativePdfPath, directory: entry.nativeDirectory || "EXTERNAL_STORAGE" });
    } catch {}
  }
}

function pageSize() {
  return pdfViewer?.pageSize?.() || null;
}

/**
 * Sync annotation layer to PdfViewer camera (scale/x/y).
 * During pan/zoom preview: CSS transform only (no canvas realloc / redraw).
 * Cap backing-store pixels — full-page DPR canvas on CAD sheets OOMs WebView.
 */
function syncAnnoLayer(opts = {}) {
  if (!pdfViewer || !els.annoLayer) return;
  const v = pageSize();
  if (!v) return;
  state.pageW = v.width;
  state.pageH = v.height;
  els.annoLayer.style.width = v.width + "px";
  els.annoLayer.style.height = v.height + "px";
  els.annoLayer.style.transform = `translate3d(${pdfViewer.x}px,${pdfViewer.y}px,0) scale(${pdfViewer.scale})`;
  if (opts.transformOnly) return;

  const cssW = v.width;
  const cssH = v.height;
  let dpr = Math.min(window.devicePixelRatio || 1, isNativeCapacitor() ? 1.5 : 2);
  const area = Math.max(1, cssW * cssH);
  if (area * dpr * dpr > ANNO_CANVAS_BUDGET) {
    dpr = Math.sqrt(ANNO_CANVAS_BUDGET / area);
  }
  const bw = Math.max(1, Math.floor(cssW * dpr));
  const bh = Math.max(1, Math.floor(cssH * dpr));
  if (els.annoCanvas.width !== bw || els.annoCanvas.height !== bh) {
    els.annoCanvas.width = bw;
    els.annoCanvas.height = bh;
    els.annoCanvas.style.width = cssW + "px";
    els.annoCanvas.style.height = cssH + "px";
  }
  const ctx = els.annoCanvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  redrawAnnotations();
}

function scheduleSync(opts = {}) {
  if (opts.transformOnly) {
    if (!pdfViewer || !els.annoLayer) return;
    const v = pageSize();
    if (!v) return;
    els.annoLayer.style.transform = `translate3d(${pdfViewer.x}px,${pdfViewer.y}px,0) scale(${pdfViewer.scale})`;
    return;
  }
  if (syncRaf) return;
  syncRaf = requestAnimationFrame(() => {
    syncRaf = 0;
    syncAnnoLayer();
  });
}

function hookViewerTransforms(viewer) {
  const origPreview = viewer.applyPreview.bind(viewer);
  viewer.applyPreview = function () {
    origPreview();
    // Pan/zoom: move overlay with CSS only — never redraw marks every frame.
    scheduleSync({ transformOnly: true });
  };
  const origChanged = viewer.changed.bind(viewer);
  viewer.changed = function () {
    origChanged();
    scheduleSync();
  };
}

function clientToPage(clientX, clientY) {
  const rect = els.pdf.getBoundingClientRect();
  const lx = clientX - rect.left;
  const ly = clientY - rect.top;
  return {
    x: (lx - pdfViewer.x) / pdfViewer.scale,
    y: (ly - pdfViewer.y) / pdfViewer.scale,
  };
}

function setTool(tool) {
  state.tool = tool;
  if (tool === "ok") state.contentMode = "ok";
  if (tool === "risk") state.contentMode = "risk";
  els.tools.forEach((btn) => btn.setAttribute("aria-pressed", String(btn.getAttribute("data-tool") === tool)));
  const draw = tool !== "pan";
  els.annoLayer.classList.toggle("interactive", draw);
  els.pdf.style.cursor = draw ? "crosshair" : "grab";
}

function paintOne(ctx, item) {
  const kind = item.kind;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (kind === "stroke") {
    const pts = item.points || [];
    if (pts.length < 2) {
      ctx.restore();
      return;
    }
    ctx.strokeStyle = item.mode === "risk" ? "#e8a317" : item.mode === "ok" ? "#1f9d55" : "#2f80ed";
    ctx.lineWidth = Math.max(2, item.width || 3);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  } else if (kind === "ok" || kind === "risk" || kind === "select") {
    const { x, y, w = 0, h = 0 } = item;
    const isOk = kind === "ok" || (kind === "select" && item.mode === "ok");
    const isSelect = kind === "select";
    if (w > 2 && h > 2) {
      ctx.strokeStyle = isOk ? "#1f9d55" : "#e00024";
      ctx.lineWidth = isSelect ? 2 : 3;
      if (isSelect) {
        ctx.setLineDash([5, 4]);
        ctx.strokeRect(x, y, w, h);
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = isOk ? "rgba(31,157,85,0.28)" : "rgba(224,0,36,0.22)";
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    }
  } else if (kind === "arrow") {
    const color = item.mode === "ok" ? "#1f9d55" : "#e8a317";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(item.x1, item.y1);
    ctx.lineTo(item.x2, item.y2);
    ctx.stroke();
    const angle = Math.atan2(item.y2 - item.y1, item.x2 - item.x1);
    const head = 12;
    ctx.beginPath();
    ctx.moveTo(item.x2, item.y2);
    ctx.lineTo(item.x2 - head * Math.cos(angle - 0.4), item.y2 - head * Math.sin(angle - 0.4));
    ctx.lineTo(item.x2 - head * Math.cos(angle + 0.4), item.y2 - head * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  } else if (kind === "note") {
    const bg = item.mode === "ok" ? "rgba(31,157,85,0.92)" : "rgba(232,163,23,0.95)";
    ctx.fillStyle = bg;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1.5;
    const text = String(item.text || "");
    ctx.font = "600 12px Segoe UI, sans-serif";
    const tw = Math.min(220, Math.max(40, ctx.measureText(text).width + 16));
    ctx.beginPath();
    ctx.roundRect?.(item.x, item.y, tw, 28, 6);
    if (!ctx.roundRect) ctx.rect(item.x, item.y, tw, 28);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.fillText(text.slice(0, 40), item.x + 8, item.y + 18);
  }
  ctx.restore();
}

function redrawAnnotations() {
  const ctx = els.annoCanvas.getContext("2d");
  if (!ctx) return;
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, els.annoCanvas.width, els.annoCanvas.height);
  const dpr = els.annoCanvas.width / Math.max(1, state.pageW);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const all = state.draft ? annotations.concat([state.draft]) : annotations;
  for (const item of all) paintOne(ctx, item);
  ctx.restore();
}

function addAnnot(item) {
  const full = { ...item, id: uid(), createdAt: new Date().toISOString() };
  annotations.push(full);
  scheduleAutosave();
  redrawAnnotations();
  return full;
}

function escapeHtml(v) {
  return String(v)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso || "—";
  }
}

const STRUCT_CODE_RE = /\b((?:VG|VR|VT|LG|LR|LA|P|R)[\-\s]?\d+)([A-Za-z])?(?=\b|[xX×]|$)/i;

function extractStructuralCode(text) {
  const m = String(text || "").match(STRUCT_CODE_RE);
  if (!m) return "";
  let code = m[1].replace(/\s+/g, "");
  if (m[2] && !/^[xX×]$/.test(m[2])) code += m[2];
  return code;
}

function dedupeDimTokens(text) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  if (!s) return "";
  const phrases = s.match(/\d+\s*[xX×]\s*\d+(?:\s*\([^)]*\))?|h\s*=\s*[\d.,]+|[^\s]+/gi) || [];
  const seen = Object.create(null);
  const out = [];
  for (const p of phrases) {
    const key = p.toLowerCase().replace(/\s+/g, "");
    if (seen[key]) continue;
    seen[key] = true;
    out.push(p);
  }
  return out.join(" ");
}

function splitLabelNameDims(label) {
  let s = String(label || "")
    .replace(/\s*[·•]\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return { name: "", dims: "", display: "" };
  let code = extractStructuralCode(s);
  if (code) {
    let rest = s
      .replace(new RegExp(code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "ig"), " ")
      .replace(/\s+/g, " ")
      .trim();
    const glued = code.match(/^((?:VG|VR|VT|LG|LR|LA|P|R)[\-]?\d+)[xX×](\d+.*)$/i);
    if (glued) {
      const stem = glued[1];
      const num = (stem.match(/\d+$/) || [""])[0];
      code = stem;
      rest = dedupeDimTokens((num + "x" + glued[2] + " " + rest).trim());
    } else {
      rest = dedupeDimTokens(rest);
    }
    return { name: code, dims: rest, display: code + (rest ? " · " + rest : "") };
  }
  return { name: s, dims: "", display: s };
}

function classifyLabel(text) {
  const code = extractStructuralCode(text).toUpperCase();
  const t = String(text || "").toUpperCase();
  const key = code || t;
  if (/^P[\-]?\d/.test(key) || /\bPILAR\b/.test(t)) return "pilar";
  if (/^(VG|VR|VT)/.test(key) || /\bVIGA\b/.test(t)) return "viga";
  if (/^(LG|LR|LA)/.test(key) || /^R[\-]?\d/.test(key) || /\bLAJE\b/.test(t)) return "laje";
  return "elemento";
}

function reportNameDims(item) {
  const raw = item.label || item.text || [item.name, item.dims].filter(Boolean).join(" ");
  const parts = splitLabelNameDims(raw);
  parts.dims = dedupeDimTokens(parts.dims);
  parts.display = parts.name ? parts.name + (parts.dims ? " · " + parts.dims : "") : parts.dims || parts.display;
  return parts;
}

function itemVpl(item) {
  const parts = reportNameDims(item);
  const t = item.elementType && item.elementType !== "elemento" ? item.elementType : classifyLabel(parts.name || parts.display);
  if (t === "viga" || t === "pilar" || t === "laje") return t;
  return "outro";
}

function groupVpl(items) {
  const g = { viga: [], pilar: [], laje: [], outro: [] };
  for (const it of items) g[itemVpl(it)].push(it);
  return g;
}

function buildReportModel() {
  const oks = annotations.filter((i) => i.kind === "ok" || (i.kind === "note" && i.mode === "ok") || (i.kind === "arrow" && i.mode === "ok"));
  const risks = annotations.filter(
    (i) => i.kind === "risk" || (i.kind === "note" && i.mode !== "ok") || (i.kind === "arrow" && i.mode !== "ok") || (i.kind === "stroke" && i.mode === "risk")
  );
  return {
    title: "Relatório de conferência de armadura",
    docName: state.docName || "PDF",
    generatedAt: new Date().toISOString(),
    counts: { ok: oks.filter((i) => i.kind === "ok").length, risk: risks.length, total: annotations.length, arrows: annotations.filter((i) => i.kind === "arrow").length, strokes: annotations.filter((i) => i.kind === "stroke").length, notes: annotations.filter((i) => i.kind === "note").length },
    oks,
    risks,
    notes: annotations.filter((i) => i.kind === "note"),
  };
}

function renderGrouped(items, lineFn) {
  const g = groupVpl(items);
  const sections = [
    ["viga", "Vigas (V)"],
    ["pilar", "Pilares (P)"],
    ["laje", "Lajes (L)"],
    ["outro", "Outros"],
  ];
  let html = "";
  for (const [key, title] of sections) {
    const list = g[key] || [];
    if (!list.length && key === "outro") continue;
    html += `<h4>${escapeHtml(title)}</h4>`;
    if (!list.length) {
      html += `<p class="group-empty">Nenhum</p>`;
      continue;
    }
    html += "<ul>" + list.map((it, i) => lineFn(it, i)).join("") + "</ul>";
  }
  return html;
}

function openReport() {
  const model = buildReportModel();
  state.lastReportModel = model;
  const okG = groupVpl(model.oks);
  const riskG = groupVpl(model.risks);
  const riskHtml = model.risks.length
    ? renderGrouped(model.risks, (r, i) => {
        const p = reportNameDims(r);
        return `<li><strong>#${i + 1}</strong> <strong>${escapeHtml(p.name || "—")}</strong>${p.dims ? " · " + escapeHtml(p.dims) : ""} — Não conforme${r.reason ? " · motivo: " + escapeHtml(r.reason) : ""} <em>(${escapeHtml(fmtTime(r.createdAt))})</em></li>`;
      })
    : "<p>Nenhum não conforme marcado.</p>";
  const okHtml = model.oks.length
    ? renderGrouped(model.oks, (r, i) => {
        const p = reportNameDims(r);
        return `<li><strong>#${i + 1}</strong> <strong>${escapeHtml(p.name || "—")}</strong>${p.dims ? " · " + escapeHtml(p.dims) : ""} — conferido</li>`;
      })
    : "<p>Nenhum elemento conferido.</p>";
  els.reportBody.innerHTML =
    `<div class="summary"><div class="stat ok"><strong>${model.counts.ok}</strong><span>Conferidos</span></div><div class="stat risk"><strong>${model.counts.risk}</strong><span>Não conformes</span></div><div class="stat"><strong>${model.counts.total}</strong><span>Marcações</span></div></div>` +
    `<p><strong>Documento:</strong> ${escapeHtml(model.docName)}<br/><strong>Gerado em:</strong> ${escapeHtml(fmtTime(model.generatedAt))}<br/><strong>OK:</strong> V ${okG.viga.length} · P ${okG.pilar.length} · L ${okG.laje.length} | <strong>NC:</strong> V ${riskG.viga.length} · P ${riskG.pilar.length} · L ${riskG.laje.length}</p>` +
    `<h3>Não conformes / riscos</h3>${riskHtml}<h3>Já conferidos (OK)</h3>${okHtml}`;
  els.reportPanel.hidden = false;
  els.reportPanel.style.display = "flex";
}

function closeReport() {
  els.reportPanel.hidden = true;
  els.reportPanel.style.display = "none";
}

function renderLibraryList() {
  const index = readLibraryIndex();
  if (!index.pdfs.length) {
    els.libraryBody.innerHTML = `<p class="group-empty">Nenhum PDF importado. Use Importar — pasta <strong>Download/ConfArmadura</strong> no app.</p>`;
    return;
  }
  els.libraryBody.innerHTML = index.pdfs
    .map((p) => {
      const n = loadAnnots(p.id).length;
      return `<div class="lib-item" data-id="${escapeHtml(p.id)}"><div class="lib-meta"><strong>${escapeHtml(p.name)}</strong><span>${Math.round((p.size || 0) / 1024)} KB · ${n} marcação(ões)</span></div><div class="lib-actions"><button type="button" data-act="open">Abrir</button><button type="button" data-act="del">⌫</button></div></div>`;
    })
    .join("");
}

function openLibrary() {
  closeReport();
  renderLibraryList();
  els.libraryPanel.hidden = false;
  els.libraryPanel.style.display = "flex";
}

function closeLibrary() {
  els.libraryPanel.hidden = true;
  els.libraryPanel.style.display = "none";
}

function updateSearchStatus() {
  if (!pdfViewer) return;
  const q = pdfViewer.searchQuery;
  const count = pdfViewer.searchMatches?.length || 0;
  const index = pdfViewer.searchIndex ?? -1;
  els.pdfResults.textContent = q ? (count ? `${index + 1} de ${count}` : pdfViewer.searchNoText ? "PDF sem texto pesquisável" : "Não encontrado") : "";
}

function onViewerChange(s) {
  els.pdfPage.value = s.page;
  els.pdfPage.max = s.pages;
  els.pdfTotal.textContent = "/ " + s.pages;
  els.zoom.textContent = s.zoom + "%";
  updateSearchStatus();
  scheduleSync();
  // getTextContent on every zoom freezes WebView — only when page changes.
  if (s.page !== state.textItemsPage) {
    refreshTextItems().catch(() => {});
  }
}

async function refreshTextItems() {
  if (!pdfViewer?.page || !pdfViewer?.lib) return;
  const page = pdfViewer.page;
  const pageNo = pdfViewer.pageNumber;
  if (state.textItemsPage === pageNo && state.textItems.length) return;
  const rotation = (page.rotate + pdfViewer.rotation) % 360;
  const vp = page.getViewport({ scale: 1, rotation });
  const tc = await page.getTextContent();
  const lib = pdfViewer.lib;
  state.textItems = (tc.items || [])
    .filter((it) => it.str && String(it.str).trim())
    .map((it) => {
      const t = it.transform;
      const hScale = Math.hypot(t[0], t[1]) || 1;
      const adv = (it.width || 0) / hScale;
      const corners = [
        [0, 0],
        [adv, 0],
        [0, 1],
        [adv, 1],
      ].map(([x, y]) => {
        const p = lib.Util.applyTransform([x, y], t);
        return vp.convertToViewportPoint(p[0], p[1]);
      });
      const xs = corners.map((c) => c[0]);
      const ys = corners.map((c) => c[1]);
      return {
        x: Math.min(...xs),
        y: Math.min(...ys),
        w: Math.max(2, Math.max(...xs) - Math.min(...xs)),
        h: Math.max(2, Math.max(...ys) - Math.min(...ys)),
        str: String(it.str || ""),
      };
    });
  state.textItemsPage = pageNo;
}

function rectsIntersect(a, b) {
  return !(a.x + a.w < b.x || b.x + b.w < a.x || a.y + a.h < b.y || b.y + b.h < a.y);
}

function isStructuralToken(str) {
  return /^(VG|VR|VT|LG|LR|LA|P|R)[\s\-]?\d/i.test(String(str || "").trim()) || /^\d{2,3}\s*[xX×]\s*\d{2,3}$/.test(String(str || "").trim());
}

function extractPdfTextInRect(sel) {
  const hits = state.textItems.filter((it) => rectsIntersect(sel, it));
  if (!hits.length) return { label: "", bbox: null };
  const cx = sel.x + sel.w / 2;
  const cy = sel.y + sel.h / 2;
  let structural = hits.filter((it) => isStructuralToken(it.str));
  let seed = structural[0] || hits[0];
  let best = Infinity;
  for (const it of structural.length ? structural : hits) {
    const isName = /^(P|VG|VR|VT|LG|R)[\s\-]?\d/i.test(it.str.trim());
    const d = Math.hypot(it.x + it.w / 2 - cx, it.y + it.h / 2 - cy) - (isName ? 40 : 0);
    if (d < best) {
      best = d;
      seed = it;
    }
  }
  const cluster = [seed];
  let box = { x: seed.x - 30, y: seed.y - 30, w: seed.w + 60, h: seed.h + 60 };
  for (const it of hits) {
    if (it !== seed && rectsIntersect(box, it)) cluster.push(it);
  }
  const minX = Math.min(...cluster.map((c) => c.x));
  const minY = Math.min(...cluster.map((c) => c.y));
  const maxX = Math.max(...cluster.map((c) => c.x + c.w));
  const maxY = Math.max(...cluster.map((c) => c.y + c.h));
  const parts = splitLabelNameDims(cluster.map((c) => c.str.trim()).filter(Boolean).join(" "));
  return {
    label: parts.display,
    name: parts.name,
    dims: parts.dims,
    bbox: { x: minX - 2, y: minY - 2, w: Math.max(4, maxX - minX + 4), h: Math.max(4, maxY - minY + 4) },
  };
}

function normalizeSel(x0, y0, x1, y1) {
  return { x: Math.min(x0, x1), y: Math.min(y0, y1), w: Math.abs(x1 - x0), h: Math.abs(y1 - y0) };
}

function paintSelectPreview(n, mode) {
  const el = els.selectPreview;
  el.className = "on " + (mode === "ok" ? "ok" : "risk");
  el.style.width = Math.max(0, n.w) + "px";
  el.style.height = Math.max(0, n.h) + "px";
  el.style.transform = `translate3d(${n.x}px,${n.y}px,0)`;
}

function hideSelectPreview() {
  els.selectPreview.className = "";
  els.selectPreview.style.width = "0";
  els.selectPreview.style.height = "0";
}

function finishToMove() {
  setTool("pan");
}

function openTextModal(title, mode) {
  state.modalMode = mode;
  els.textModalTitle.textContent = title;
  els.textInput.value = "";
  els.textModal.hidden = false;
  setTimeout(() => els.textInput.focus(), 50);
}

function closeTextModal() {
  els.textModal.hidden = true;
  state.notePending = null;
  state.riskPending = null;
  state.modalMode = "note";
}

function looksLikePdf(u8) {
  return u8 && u8.length > 8 && u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46;
}

/** @returns {Promise<boolean>} true if page is on screen */
async function openPdfBytes(bytes, label, opts = {}) {
  const gen = ++openGeneration;
  openBusy = true;
  clearTimeout(openWatchdog);
  const labelShort = (label || "PDF").slice(0, 42);
  setHint("Abrindo " + labelShort + "… (máx. " + OPEN_TIMEOUT_MS / 1000 + "s)", {
    busy: true,
    cancellable: true,
  });
  // Watchdog UI even if a race misses — keeps Cancel available.
  openWatchdog = setTimeout(() => {
    if (gen !== openGeneration || !openBusy) return;
    setHint("Demorando… Cancele e tente de novo, ou use outro PDF.", {
      busy: true,
      cancellable: true,
    });
  }, OPEN_TIMEOUT_MS);

  try {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    if (!looksLikePdf(u8)) throw new Error("Arquivo não é PDF válido");
    const docId = opts.docId || makeDocId(label, u8);
    const blob = new Blob([u8.slice(0)], { type: "application/pdf" });

    // Yield so Cancel / toolbar paint before heavy work.
    await new Promise((r) => setTimeout(r, 0));
    if (gen !== openGeneration) return false;

    const src = workerSrcUrl();
    if (!src || String(src).startsWith("blob:")) {
      throw new Error("workerSrc inválido — use URL real do pdf.worker.js");
    }

    await pdfViewer.open(blob, { timeoutMs: OPEN_TIMEOUT_MS });
    if (gen !== openGeneration) return false;

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    if (gen !== openGeneration) return false;
    if (pdfViewer.page) await pdfViewer.fit();
    if (gen !== openGeneration) return false;
    if (!pdfViewer.page) throw new Error("PDF sem página renderizada");

    state.docId = docId;
    state.docName = label;
    state.pdfBytes = u8.slice(0);
    els.docLabel.textContent = label;
    annotations = loadAnnots(docId);
    state.textItems = [];
    state.textItemsPage = 0;
    syncAnnoLayer();
    openBusy = false;
    clearTimeout(openWatchdog);
    setHint(annotations.length ? `Marcações restauradas (${annotations.length}).` : "✓/✕ sobre o rótulo · pinça para zoom.");
    setTimeout(() => {
      if (!openBusy) setHint("");
    }, 2400);
    setTimeout(() => refreshTextItems().catch(() => {}), 0);
    if (!opts.skipLibrarySave) {
      setTimeout(() => savePdfToLibrary(u8, label, docId).catch(console.warn), 0);
    } else renderLibraryList();
    return true;
  } catch (err) {
    console.error(err);
    if (gen !== openGeneration) return false;
    openBusy = false;
    clearTimeout(openWatchdog);
    try {
      await pdfViewer.close();
    } catch {}
    const msg = (err?.message || String(err)).slice(0, 140);
    setHint("Falha ao abrir: " + msg, { busy: false, cancellable: true });
    if (els.btnHintCancel) els.btnHintCancel.textContent = "Fechar";
    return false;
  }
}

async function tryLoadDemo() {
  try {
    const res = await fetch(new URL(DEMO_PDF, import.meta.url).href);
    if (!res.ok) throw new Error("HTTP " + res.status);
    const ok = await openPdfBytes(new Uint8Array(await res.arrayBuffer()), DEMO_LABEL);
    if (!ok) setHint("Demo não abriu. Use 📄 Importar PDF.", { cancellable: true });
  } catch (err) {
    console.warn(err);
    setHint("Demo indisponível. Use 📄 Importar PDF.", { cancellable: true });
  }
}

function onAnnoPointerDown(e) {
  if (state.tool === "pan") return;
  e.preventDefault();
  e.stopPropagation();
  try {
    els.annoLayer.setPointerCapture(e.pointerId);
  } catch {}
  const p = clientToPage(e.clientX, e.clientY);
  state.drawing = true;
  if (state.tool === "stroke") {
    state.draft = { kind: "stroke", mode: state.contentMode, width: 3, points: [p] };
  } else if (state.tool === "arrow") {
    state.draft = { kind: "arrow", mode: state.contentMode, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
  } else if (state.tool === "ok" || state.tool === "risk") {
    state.draft = { kind: "select", mode: state.tool === "ok" ? "ok" : "risk", x0: p.x, y0: p.y, x: p.x, y: p.y, w: 0, h: 0 };
    paintSelectPreview({ x: p.x, y: p.y, w: 0, h: 0 }, state.draft.mode);
  } else if (state.tool === "note") {
    state.drawing = false;
    state.notePending = p;
    openTextModal("Nota no PDF", "note");
  }
  redrawAnnotations();
}

function onAnnoPointerMove(e) {
  if (!state.drawing || !state.draft) return;
  e.preventDefault();
  e.stopPropagation();
  const p = clientToPage(e.clientX, e.clientY);
  const d = state.draft;
  if (d.kind === "stroke") {
    const last = d.points[d.points.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) < 1.2) return;
    d.points.push(p);
    redrawAnnotations();
  } else if (d.kind === "arrow") {
    d.x2 = p.x;
    d.y2 = p.y;
    redrawAnnotations();
  } else if (d.kind === "select") {
    const n = normalizeSel(d.x0, d.y0, p.x, p.y);
    Object.assign(d, n);
    paintSelectPreview(n, d.mode);
  }
}

function onAnnoPointerUp(e) {
  if (!state.drawing) return;
  e.preventDefault();
  e.stopPropagation();
  state.drawing = false;
  const d = state.draft;
  state.draft = null;
  hideSelectPreview();
  if (!d) {
    redrawAnnotations();
    return;
  }
  if (d.kind === "stroke" && d.points?.length > 1) {
    addAnnot(d);
    finishToMove();
  } else if (d.kind === "arrow" && Math.hypot(d.x2 - d.x1, d.y2 - d.y1) > 8) {
    addAnnot(d);
    finishToMove();
  } else if (d.kind === "select") {
    endSelect(d);
  } else {
    redrawAnnotations();
    finishToMove();
  }
}

async function endSelect(d) {
  if (d.w < 8 || d.h < 8) {
    setHint("Arraste sobre o rótulo (ex.: VG-2 14x90).");
    setTimeout(() => setHint(""), 1800);
    finishToMove();
    redrawAnnotations();
    return;
  }
  await refreshTextItems();
  const padded = { x: d.x - 8, y: d.y - 8, w: d.w + 16, h: d.h + 16 };
  const rec = extractPdfTextInRect(padded);
  const box = rec.bbox && rec.bbox.w > 2 ? rec.bbox : { x: d.x, y: d.y, w: d.w, h: d.h };
  const parts = splitLabelNameDims(rec.label || "");
  const label = parts.display || "(sem texto)";
  const elementType = classifyLabel(label);
  if (d.mode === "ok") {
    addAnnot({ kind: "ok", ...box, label, text: label, name: parts.name, dims: parts.dims, elementType, source: "pdf-text" });
    setHint((parts.name || label).slice(0, 48) + " ✓");
    setTimeout(() => setHint(""), 1400);
    finishToMove();
  } else {
    state.riskPending = { ...box, label, text: label, name: parts.name, dims: parts.dims, elementType, source: "pdf-text" };
    openTextModal("Motivo do não conforme", "risk");
  }
  redrawAnnotations();
}

function saveModal() {
  const text = els.textInput.value.trim();
  if (state.modalMode === "risk") {
    if (!text) {
      setHint("Informe o motivo do erro.");
      return;
    }
    const p = state.riskPending;
    addAnnot({
      kind: "risk",
      x: p.x,
      y: p.y,
      w: p.w,
      h: p.h,
      label: p.label,
      text: p.label,
      name: p.name,
      dims: p.dims,
      elementType: p.elementType,
      reason: text,
      source: p.source,
    });
    closeTextModal();
    setHint("Não conforme registrado.");
    setTimeout(() => setHint(""), 1600);
    finishToMove();
    return;
  }
  if (!text || !state.notePending) {
    closeTextModal();
    return;
  }
  addAnnot({ kind: "note", mode: state.contentMode, x: state.notePending.x, y: state.notePending.y, text });
  closeTextModal();
  finishToMove();
}

async function setWake(on) {
  state.wakeEnabled = !!on;
  $("btn-wake").classList.toggle("on", state.wakeEnabled);
  $("btn-wake").setAttribute("aria-pressed", String(state.wakeEnabled));
  $("btn-wake").textContent = state.wakeEnabled ? "Tela ligada" : "Tela pode apagar";
  if (!state.wakeEnabled) {
    try {
      await state.wakeLock?.release();
    } catch {}
    state.wakeLock = null;
    return;
  }
  if (!("wakeLock" in navigator)) return;
  try {
    state.wakeLock = await navigator.wakeLock.request("screen");
  } catch {}
}

function bindDock() {
  const dock = $("tool-dock");
  const handle = $("dock-handle");
  if (!dock || !handle) return;
  let collapsed = false;
  let dragging = false;
  let moved = false;
  let sx = 0,
    sy = 0,
    ol = 0,
    ot = 0;
  const clamp = () => {
    const r = dock.getBoundingClientRect();
    const pad = 6;
    let left = r.left;
    let top = r.top;
    left = Math.max(pad, Math.min(left, window.innerWidth - r.width - pad));
    top = Math.max(pad + (window.visualViewport?.offsetTop || 0), Math.min(top, window.innerHeight - 48));
    dock.style.left = left + "px";
    dock.style.top = top + "px";
    dock.style.right = "auto";
    dock.style.bottom = "auto";
    dock.style.transform = "none";
  };
  const apply = () => {
    dock.classList.toggle("collapsed", collapsed);
    handle.setAttribute("aria-expanded", String(!collapsed));
    handle.title = collapsed ? "Expandir · Arrastar" : "Recolher · Arrastar";
  };
  handle.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    dragging = true;
    moved = false;
    sx = e.clientX;
    sy = e.clientY;
    const r = dock.getBoundingClientRect();
    ol = r.left;
    ot = r.top;
    dock.style.transform = "none";
    dock.style.zIndex = "10050";
    try {
      handle.setPointerCapture(e.pointerId);
    } catch {}
    e.preventDefault();
    e.stopPropagation();
  });
  handle.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - sx;
    const dy = e.clientY - sy;
    if (Math.abs(dx) + Math.abs(dy) > 8) moved = true;
    if (!moved) return;
    dock.style.left = ol + dx + "px";
    dock.style.top = ot + dy + "px";
    dock.style.right = "auto";
    dock.style.bottom = "auto";
  });
  const endDrag = (e) => {
    if (!dragging) return;
    dragging = false;
    try {
      if (e?.pointerId != null) handle.releasePointerCapture(e.pointerId);
    } catch {}
    if (!moved) {
      collapsed = !collapsed;
      apply();
    } else {
      clamp();
    }
  };
  handle.addEventListener("pointerup", endDrag);
  handle.addEventListener("pointercancel", endDrag);
  handle.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      collapsed = !collapsed;
      apply();
    }
  });
  apply();
  clamp();
}

function showAbout() {
  window.alert(
    [
      "Conf. Armadura — " + APP_REVISION_LABEL,
      "versionName " + APP_VERSION + " · versionCode " + APP_VERSION_CODE,
      "workerSrc: " + String(workerSrcUrl() || "").slice(-48),
      "PdfViewer Prumo + marcações de campo",
    ].join("\n")
  );
}

function bindUi() {
  const rev = $("app-revision");
  if (rev) rev.textContent = APP_REVISION_LABEL;
  document.title = "Conf. Armadura · " + APP_REVISION_LABEL;
  els.tools.forEach((btn) => btn.addEventListener("click", () => setTool(btn.getAttribute("data-tool"))));
  if (els.btnHintCancel) {
    els.btnHintCancel.onclick = () => {
      if (els.btnHintCancel.textContent === "Fechar") {
        setHint("Pronto · 📄 Importar · 📚 Biblioteca · Demo");
        if (els.btnHintCancel) els.btnHintCancel.textContent = "Cancelar";
        return;
      }
      cancelOpen("Abertura cancelada.");
    };
  }
  $("btn-about").onclick = () => showAbout();
  $("btn-wake").onclick = () => setWake(!state.wakeEnabled);
  $("btn-undo").onclick = () => {
    annotations.pop();
    scheduleAutosave();
    redrawAnnotations();
  };
  $("btn-clear").onclick = () => {
    if (!annotations.length) return;
    if (confirm("Limpar todas as marcações?")) {
      annotations = [];
      scheduleAutosave();
      redrawAnnotations();
    }
  };
  $("btn-demo").onclick = () => tryLoadDemo();
  $("btn-library").onclick = () => openLibrary();
  $("btn-close-library").onclick = () => closeLibrary();
  $("btn-library-demo").onclick = () => {
    closeLibrary();
    tryLoadDemo();
  };
  $("btn-report").onclick = () => openReport();
  $("btn-report-top").onclick = () => openReport();
  $("btn-close-report").onclick = () => closeReport();
  $("btn-text-cancel").onclick = () => {
    closeTextModal();
    finishToMove();
  };
  $("btn-text-ok").onclick = () => saveModal();
  $("btn-export-text").onclick = async () => {
    if (!state.lastReportModel) openReport();
    const m = state.lastReportModel;
    const lines = [m.title, m.docName, ""];
    m.risks.forEach((r, i) => {
      const p = reportNameDims(r);
      lines.push(`${i + 1}. ${p.display || p.name} — Não conforme${r.reason ? " · " + r.reason : ""}`);
    });
    lines.push("", "OK:");
    m.oks.forEach((r, i) => {
      const p = reportNameDims(r);
      lines.push(`${i + 1}. ${p.display || p.name} — conferido`);
    });
    const text = lines.join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setHint("Relatório copiado.");
    } catch {
      prompt("Copie:", text);
    }
  };
  $("btn-export-html").onclick = () => {
    if (!state.lastReportModel) openReport();
    const blob = new Blob([`<html><body>${els.reportBody.innerHTML}</body></html>`], { type: "text/html" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "relatorio-conferencia.html";
    a.click();
  };
  $("btn-share").onclick = async () => {
    if (!state.lastReportModel) openReport();
    const text = els.reportBody.innerText;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Relatório", text });
      } catch {}
    } else $("btn-export-text").click();
  };

  async function readPickedFile(file) {
    if (!file) throw new Error("Nenhum arquivo selecionado");
    let buf;
    if (typeof file.arrayBuffer === "function") {
      buf = await file.arrayBuffer();
    } else {
      buf = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error || new Error("Falha ao ler o arquivo"));
        reader.readAsArrayBuffer(file);
      });
    }
    const bytes = new Uint8Array(buf).slice(0);
    if (!bytes.byteLength) throw new Error("Arquivo vazio (" + (file.name || "sem nome") + ")");
    return { bytes, name: file.name || "documento.pdf", size: file.size || bytes.byteLength };
  }

  const onFile = async (input) => {
    const file = input?.files?.[0];
    if (!file) {
      setHint("Nenhum PDF selecionado.");
      return;
    }
    // Read BEFORE clearing input.value — clearing first invalidates File on WebView/Chrome.
    setHint("Lendo " + (file.name || "PDF") + "…", { busy: true, cancellable: true });
    try {
      const picked = await readPickedFile(file);
      try {
        input.value = "";
      } catch {}
      closeLibrary();
      const ok = await openPdfBytes(picked.bytes, picked.name);
      if (!ok) console.warn("[open] falhou após seleção", picked.name, picked.size);
    } catch (err) {
      console.error(err);
      try {
        input.value = "";
      } catch {}
      setHint("Falha ao ler arquivo: " + (err?.message || String(err)).slice(0, 120), {
        busy: false,
        cancellable: true,
      });
      if (els.btnHintCancel) els.btnHintCancel.textContent = "Fechar";
    }
  };
  els.fileInput?.addEventListener("change", () => onFile(els.fileInput));
  els.fileInputLibrary?.addEventListener("change", () => onFile(els.fileInputLibrary));

  els.libraryBody.addEventListener("click", async (e) => {
    const btn = e.target.closest?.("button[data-act]");
    if (!btn) return;
    const id = btn.closest(".lib-item")?.getAttribute("data-id");
    if (!id) return;
    if (btn.getAttribute("data-act") === "open") {
      try {
        const doc = await loadPdfFromLibrary(id);
        await openPdfBytes(doc.bytes, doc.name, { docId: id, skipLibrarySave: true });
        closeLibrary();
      } catch {
        setHint("Não foi possível reabrir.");
      }
    } else if (btn.getAttribute("data-act") === "del") {
      if (!confirm("Remover da biblioteca?")) return;
      await removeFromLibrary(id);
      renderLibraryList();
    }
  });

  $("pdf-prev").onclick = () => pdfViewer.go(pdfViewer.pageNumber - 1).catch(console.warn);
  $("pdf-next").onclick = () => pdfViewer.go(pdfViewer.pageNumber + 1).catch(console.warn);
  $("pdf-page").onchange = (e) => pdfViewer.go(e.target.value).catch(console.warn);
  $("pdf-rotate").onclick = async () => {
    await pdfViewer.rotate();
    state.textItems = [];
    state.textItemsPage = 0;
    syncAnnoLayer();
  };
  $("minus").onclick = () => pdfViewer.zoomCentered(1 / 1.2);
  $("plus").onclick = () => pdfViewer.zoomCentered(1.2);
  $("fit").onclick = () => pdfViewer.fit().catch(console.warn);
  $("pdf-search").onclick = async () => {
    els.pdfResults.textContent = "Buscando…";
    await pdfViewer.search(els.pdfQuery.value);
    updateSearchStatus();
  };
  els.pdfQuery.addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("pdf-search").click();
  });
  $("pdf-match").onclick = () => pdfViewer.nextMatch(1).then(updateSearchStatus);
  $("pdf-match-prev").onclick = () => pdfViewer.nextMatch(-1).then(updateSearchStatus);

  els.annoLayer.addEventListener("pointerdown", onAnnoPointerDown);
  els.annoLayer.addEventListener("pointermove", onAnnoPointerMove);
  els.annoLayer.addEventListener("pointerup", onAnnoPointerUp);
  els.annoLayer.addEventListener("pointercancel", onAnnoPointerUp);

  window.addEventListener("resize", () => {
    if (!pdfViewer?.page) return;
    (pdfViewer.fitted ? pdfViewer.fit() : pdfViewer.render()).then(() => syncAnnoLayer()).catch(console.warn);
  });

  bindDock();
}

async function boot() {
  bindUi();
  setTool("pan");
  setWake(true);
  pdfViewer = new PdfViewer(els.pdf, onViewerChange, (err) => {
    console.error(err);
    setHint(err?.message || "Erro no PDF", { cancellable: true });
  });
  hookViewerTransforms(pdfViewer);
  // Never auto-open heavy CAD / library on boot — keeps UI usable.
  setHint("Pronto · 📄 Importar · 📚 Biblioteca · Demo");
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // Warm pdf.js after first paint (does not open a document).
  setTimeout(() => {
    loadPdfLib()
      .then(() => console.info("[pdf-safe] workerSrc=", workerSrcUrl()))
      .catch((e) => console.warn("[pdf-safe] preload failed", e));
  }, 200);
}

boot().catch((err) => {
  console.error(err);
  setHint("Falha na inicialização: " + (err?.message || String(err)).slice(0, 100), { cancellable: true });
});
