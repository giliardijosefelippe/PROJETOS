/**
 * Build conference report HTML / plain text from annotations.
 */

function fmtTime(iso) {
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso || "—";
  }
}

function labelFor(item) {
  if (item.kind === "ok") return "Trecho OK";
  if (item.kind === "risk") return "Risco / problema";
  if (item.kind === "note") return item.mode === "ok" ? "Nota OK" : "Nota de risco";
  if (item.kind === "arrow") return item.mode === "ok" ? "Seta OK" : "Seta risco";
  if (item.kind === "stroke") {
    if (item.mode === "ok") return "Risco (traço OK)";
    if (item.mode === "risk") return "Risco (traço problema)";
    return "Traço / risco no desenho";
  }
  return item.kind;
}

export function buildReportModel(docName, annotations) {
  const summary = annotations.summarize();
  const items = annotations.list();
  return {
    title: "Relatório de conferência de armadura",
    docName: docName || "PDF sem nome",
    generatedAt: new Date().toISOString(),
    counts: {
      ok: summary.ok.length,
      risk: summary.risk.length + summary.notes.filter((n) => n.mode !== "ok").length + summary.arrows.filter((a) => a.mode !== "ok").length + summary.strokes.filter((s) => s.mode === "risk").length,
      notes: summary.notes.length,
      arrows: summary.arrows.length,
      strokes: summary.strokes.length,
      total: summary.total,
    },
    risks: items.filter(
      (i) =>
        i.kind === "risk" ||
        (i.kind === "note" && i.mode !== "ok") ||
        (i.kind === "arrow" && i.mode !== "ok") ||
        (i.kind === "stroke" && i.mode === "risk")
    ),
    oks: items.filter(
      (i) =>
        i.kind === "ok" ||
        (i.kind === "note" && i.mode === "ok") ||
        (i.kind === "arrow" && i.mode === "ok") ||
        (i.kind === "stroke" && i.mode === "ok")
    ),
    notes: items.filter((i) => i.kind === "note"),
    arrows: items.filter((i) => i.kind === "arrow"),
    all: items,
  };
}

export function renderReportHtmlFragment(model) {
  const riskLis = model.risks
    .map((r, idx) => {
      const detail = r.text ? ` — ${escapeHtml(String(r.text))}` : "";
      return `<li><strong>#${idx + 1}</strong> ${escapeHtml(labelFor(r))}${detail} <em>(${escapeHtml(fmtTime(r.createdAt))})</em></li>`;
    })
    .join("");

  const okLis = model.oks
    .map((r, idx) => {
      const detail = r.text ? ` — ${escapeHtml(String(r.text))}` : "";
      return `<li><strong>#${idx + 1}</strong> ${escapeHtml(labelFor(r))}${detail}</li>`;
    })
    .join("");

  const noteLis = model.notes
    .map((r) => `<li>${escapeHtml(String(r.text || "(vazia)"))} <em>(${escapeHtml(labelFor(r))})</em></li>`)
    .join("");

  return `
    <div class="summary">
      <div class="stat ok"><strong>${model.counts.ok}</strong><span>Trechos OK</span></div>
      <div class="stat risk"><strong>${model.counts.risk}</strong><span>Riscos</span></div>
      <div class="stat"><strong>${model.counts.total}</strong><span>Marcações</span></div>
    </div>
    <p><strong>Documento:</strong> ${escapeHtml(model.docName)}<br/>
    <strong>Gerado em:</strong> ${escapeHtml(fmtTime(model.generatedAt))}</p>
    <h3>Riscos / problemas</h3>
    ${riskLis ? `<ul>${riskLis}</ul>` : "<p>Nenhum risco marcado.</p>"}
    <h3>Trechos OK</h3>
    ${okLis ? `<ul>${okLis}</ul>` : "<p>Nenhum trecho OK marcado.</p>"}
    <h3>Notas de texto</h3>
    ${noteLis ? `<ul>${noteLis}</ul>` : "<p>Sem notas.</p>"}
    <h3>Setas</h3>
    <p>${model.counts.arrows} seta(s) · ${model.counts.strokes} traço(s)</p>
  `;
}

export function buildPlainTextReport(model) {
  const lines = [];
  lines.push(model.title);
  lines.push(`Documento: ${model.docName}`);
  lines.push(`Gerado em: ${fmtTime(model.generatedAt)}`);
  lines.push("");
  lines.push(`Resumo: ${model.counts.ok} OK · ${model.counts.risk} riscos · ${model.counts.total} marcações`);
  lines.push("");
  lines.push("RISCOS / PROBLEMAS");
  if (!model.risks.length) lines.push("- Nenhum");
  model.risks.forEach((r, i) => {
    lines.push(`${i + 1}. ${labelFor(r)}${r.text ? ` — ${r.text}` : ""} (${fmtTime(r.createdAt)})`);
  });
  lines.push("");
  lines.push("TRECHOS OK");
  if (!model.oks.length) lines.push("- Nenhum");
  model.oks.forEach((r, i) => {
    lines.push(`${i + 1}. ${labelFor(r)}${r.text ? ` — ${r.text}` : ""}`);
  });
  lines.push("");
  lines.push("NOTAS");
  if (!model.notes.length) lines.push("- Nenhuma");
  model.notes.forEach((r) => {
    lines.push(`- ${r.text || "(vazia)"} [${labelFor(r)}]`);
  });
  lines.push("");
  lines.push(`Setas: ${model.counts.arrows} · Traços: ${model.counts.strokes}`);
  return lines.join("\n");
}

export function buildExportableHtmlDocument(model) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(model.title)}</title>
  <style>
    body { font-family: system-ui, sans-serif; margin: 24px; color: #111; background: #fff; }
    h1 { font-size: 1.4rem; margin: 0 0 8px; }
    .meta { color: #444; margin-bottom: 20px; }
    .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
    .card { border: 1px solid #ccc; border-radius: 8px; padding: 12px 16px; min-width: 120px; }
    .ok { color: #147a3d; }
    .risk { color: #9a6b00; }
    h2 { font-size: 1rem; margin-top: 24px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    li { margin: 6px 0; }
  </style>
</head>
<body>
  <h1>${escapeHtml(model.title)}</h1>
  <div class="meta">
    <div><strong>Documento:</strong> ${escapeHtml(model.docName)}</div>
    <div><strong>Gerado em:</strong> ${escapeHtml(fmtTime(model.generatedAt))}</div>
  </div>
  <div class="cards">
    <div class="card ok"><strong>${model.counts.ok}</strong><br/>Trechos OK</div>
    <div class="card risk"><strong>${model.counts.risk}</strong><br/>Riscos</div>
    <div class="card"><strong>${model.counts.total}</strong><br/>Marcações</div>
  </div>
  ${renderReportHtmlFragment(model).replace(/class="summary"[\s\S]*?<\/div>\s*<p><strong>Documento:[\s\S]*?<\/p>/, "")}
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
