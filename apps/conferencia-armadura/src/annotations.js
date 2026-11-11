/** @typedef {'stroke'|'ok'|'risk'|'arrow'|'note'} AnnoKind */

/**
 * Annotation store in PDF page space (points at scale 1).
 */
export function createAnnotationStore() {
  /** @type {Array<Record<string, unknown>>} */
  let items = [];
  let draft = null;

  return {
    list() {
      return items.slice();
    },
    clear() {
      items = [];
      draft = null;
    },
    undo() {
      if (draft) {
        draft = null;
        return true;
      }
      if (!items.length) return false;
      items.pop();
      return true;
    },
    getDraft() {
      return draft;
    },
    setDraft(value) {
      draft = value;
    },
    commitDraft() {
      if (!draft) return null;
      const item = { ...draft, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      items.push(item);
      draft = null;
      return item;
    },
    add(item) {
      const full = { ...item, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
      items.push(full);
      return full;
    },
    summarize() {
      const ok = items.filter((i) => i.kind === "ok");
      const risk = items.filter((i) => i.kind === "risk");
      const notes = items.filter((i) => i.kind === "note");
      const arrows = items.filter((i) => i.kind === "arrow");
      const strokes = items.filter((i) => i.kind === "stroke");
      return { ok, risk, notes, arrows, strokes, total: items.length };
    },
    toJSON() {
      return JSON.stringify({ version: 1, items }, null, 2);
    },
  };
}

/**
 * Draw annotations onto the overlay canvas.
 * @param {CanvasRenderingContext2D} ctx
 * @param {Array<Record<string, unknown>>} items
 * @param {number} scale
 * @param {Record<string, unknown>|null} draft
 */
export function paintAnnotations(ctx, items, scale, draft) {
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const all = draft ? [...items, draft] : items;
  for (const item of all) {
    paintOne(ctx, item, scale);
  }
}

function paintOne(ctx, item, scale) {
  const kind = item.kind;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (kind === "stroke") {
    const points = /** @type {Array<{x:number,y:number}>} */ (item.points || []);
    if (points.length < 2) {
      ctx.restore();
      return;
    }
    ctx.strokeStyle = item.mode === "risk" ? "#e8a317" : item.mode === "ok" ? "#1f9d55" : "#2f80ed";
    ctx.lineWidth = Math.max(2, (item.width || 3) * scale);
    ctx.beginPath();
    ctx.moveTo(points[0].x * scale, points[0].y * scale);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x * scale, points[i].y * scale);
    }
    ctx.stroke();
  } else if (kind === "ok") {
    const x = /** @type {number} */ (item.x) * scale;
    const y = /** @type {number} */ (item.y) * scale;
    const s = 14 * scale;
    ctx.strokeStyle = "#1f9d55";
    ctx.fillStyle = "rgba(31,157,85,0.18)";
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x - 6 * scale, y);
    ctx.lineTo(x - 1 * scale, y + 6 * scale);
    ctx.lineTo(x + 8 * scale, y - 7 * scale);
    ctx.stroke();
  } else if (kind === "risk") {
    const x = /** @type {number} */ (item.x) * scale;
    const y = /** @type {number} */ (item.y) * scale;
    const s = 16 * scale;
    ctx.fillStyle = "rgba(232,163,23,0.22)";
    ctx.strokeStyle = "#e8a317";
    ctx.lineWidth = Math.max(2, 3 * scale);
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 0.9, y + s * 0.75);
    ctx.lineTo(x - s * 0.9, y + s * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#2a1f05";
    ctx.font = `bold ${Math.max(12, 14 * scale)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("!", x, y + 2 * scale);
  } else if (kind === "arrow") {
    const x1 = /** @type {number} */ (item.x1) * scale;
    const y1 = /** @type {number} */ (item.y1) * scale;
    const x2 = /** @type {number} */ (item.x2) * scale;
    const y2 = /** @type {number} */ (item.y2) * scale;
    const color = item.mode === "ok" ? "#1f9d55" : "#e8a317";
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(2, 3.5 * scale);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    const angle = Math.atan2(y2 - y1, x2 - x1);
    const head = 12 * scale;
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - head * Math.cos(angle - 0.4), y2 - head * Math.sin(angle - 0.4));
    ctx.lineTo(x2 - head * Math.cos(angle + 0.4), y2 - head * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fill();
  } else if (kind === "note") {
    const x = /** @type {number} */ (item.x) * scale;
    const y = /** @type {number} */ (item.y) * scale;
    const text = String(item.text || "");
    const mode = item.mode === "ok" ? "ok" : "risk";
    const bg = mode === "ok" ? "rgba(31,157,85,0.92)" : "rgba(232,163,23,0.95)";
    const fg = mode === "ok" ? "#d8ffe8" : "#2a1f05";
    ctx.font = `bold ${Math.max(11, 12 * scale)}px sans-serif`;
    const padding = 6 * scale;
    const metrics = ctx.measureText(text || " ");
    const w = Math.max(40 * scale, metrics.width + padding * 2);
    const h = 22 * scale;
    ctx.fillStyle = bg;
    roundRect(ctx, x, y - h, w, h, 4 * scale);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + padding, y - h / 2);
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}
