import PDFDocument from "pdfkit";
import type { VolumeCompareResult } from "./geometry";
import type { SiteIndicators } from "./indicators";

export type McReportPayload = {
  organizationName: string;
  siteCode: string;
  siteName: string;
  pourCode: string;
  pourTitle: string;
  pourDate: string | null;
  isDemo: boolean;
  generatedBy: string;
  generatedAt: Date;
  regions: Array<{
    name: string;
    areaM2: number | null;
    tool: string;
  }>;
  elements: Array<{
    code: string;
    name: string;
    kind: string;
    percent: number | null;
    volumeEstimadoM3: number | null;
    volumeTeoricoM3: number | null;
    indeterminate?: boolean;
    warnings?: string[];
  }>;
  deliveries: Array<{
    nf: string;
    plate: string | null;
    volumeNfM3: number;
    allocatedM3: number;
  }>;
  slumps: Array<{
    nf: string;
    measuredMm: number;
    specMm: number | null;
    compliant: boolean | null;
  }>;
  compare: VolumeCompareResult;
  warnings: string[];
};

export async function buildMcPourReportPdf(
  payload: McReportPayload,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    doc
      .fontSize(16)
      .fillColor("#E00024")
      .text("MapaConcreto — Relatório de concretagem", { continued: false });
    doc.moveDown(0.3);
    doc
      .fontSize(10)
      .fillColor("#222")
      .text(`${payload.organizationName}`);
    if (payload.isDemo) {
      doc
        .fillColor("#9a6b00")
        .text("DADOS DE DEMONSTRAÇÃO — não são registros de obra real.");
    }
    doc.fillColor("#222");
    doc.moveDown();
    doc.text(`Obra: ${payload.siteCode} — ${payload.siteName}`);
    doc.text(`Concretagem: ${payload.pourCode} — ${payload.pourTitle}`);
    if (payload.pourDate) doc.text(`Data: ${payload.pourDate}`);
    doc.text(
      `Emitido por ${payload.generatedBy} em ${payload.generatedAt.toISOString()}`,
    );

    doc.moveDown();
    doc.fontSize(12).fillColor("#E00024").text("Regiões mapeadas");
    doc.fontSize(10).fillColor("#222");
    for (const r of payload.regions) {
      doc.text(
        `• ${r.name} (${r.tool}) — área ${r.areaM2 != null ? r.areaM2.toFixed(3) : "—"} m²`,
      );
    }

    doc.moveDown();
    doc.fontSize(12).fillColor("#E00024").text("Elementos e quantitativos");
    doc.fontSize(10).fillColor("#222");
    for (const e of payload.elements) {
      const pct =
        e.percent != null ? `${e.percent.toFixed(1)}%` : "indeterminado";
      const vol =
        e.volumeEstimadoM3 != null
          ? `${e.volumeEstimadoM3.toFixed(3)} m³`
          : "indeterminado";
      doc.text(
        `• ${e.code} ${e.name} [${e.kind}] — ${pct} · vol. estimado ${vol} · teórico ${e.volumeTeoricoM3 ?? "—"} m³`,
      );
      for (const w of e.warnings || []) {
        doc.fillColor("#9a6b00").text(`  aviso: ${w}`);
        doc.fillColor("#222");
      }
    }

    doc.moveDown();
    doc.fontSize(12).fillColor("#E00024").text("Cargas / NFs");
    doc.fontSize(10).fillColor("#222");
    for (const d of payload.deliveries) {
      doc.text(
        `• NF ${d.nf}${d.plate ? ` · placa ${d.plate}` : ""} — NF ${d.volumeNfM3.toFixed(2)} m³ · alocado ${d.allocatedM3.toFixed(2)} m³`,
      );
    }

    doc.moveDown();
    doc.fontSize(12).fillColor("#E00024").text("Slump Test");
    doc.fontSize(10).fillColor("#222");
    if (!payload.slumps.length) {
      doc.text("Nenhum ensaio registrado nesta concretagem.");
    }
    for (const s of payload.slumps) {
      const conf =
        s.compliant == null
          ? "sem critério"
          : s.compliant
            ? "conforme"
            : "não conforme";
      doc.text(
        `• NF ${s.nf}: medido ${s.measuredMm} mm (espec. ${s.specMm ?? "—"} mm) — ${conf}`,
      );
    }

    doc.moveDown();
    doc.fontSize(12).fillColor("#E00024").text("Comparativo de volumes");
    doc.fontSize(10).fillColor("#222");
    doc.text(payload.compare.labels.diferencaNfTeorico);
    doc.text(
      `Diferença NF − teórico: ${payload.compare.diferencaNfTeorico.toFixed(3)} m³` +
        (payload.compare.desvioPercentualNfTeorico != null
          ? ` (${payload.compare.desvioPercentualNfTeorico.toFixed(1)}%)`
          : ""),
    );
    doc.text(`Saldo de carga: ${payload.compare.saldoCarga.toFixed(3)} m³`);
    doc.fillColor("#5a5a5a").text(payload.compare.labels.note);
    doc.fillColor("#222");

    if (payload.warnings.length) {
      doc.moveDown();
      doc.fontSize(12).fillColor("#9a6b00").text("Avisos / dados insuficientes");
      doc.fontSize(10);
      for (const w of payload.warnings) doc.text(`• ${w}`);
    }

    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor("#5a5a5a")
      .text(
        "Mapa esquemático: exportação vetorial completa da planta fica para incremento futuro; este PDF consolida quantitativos e rastreabilidade.",
      );

    doc.end();
  });
}

export type McConsolidatedReportPayload = {
  organizationName: string;
  siteCode: string;
  siteName: string;
  floorLabel: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  isDemo: boolean;
  generatedBy: string;
  generatedAt: Date;
  indicators: SiteIndicators;
  pours: Array<{ code: string; title: string; status: string; pourDate: string | null }>;
};

export async function buildMcConsolidatedReportPdf(
  payload: McConsolidatedReportPayload,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const ind = payload.indicators;
    doc
      .fontSize(16)
      .fillColor("#E00024")
      .text("MapaConcreto — Relatório consolidado");
    doc.moveDown(0.3);
    doc.fontSize(10).fillColor("#222").text(payload.organizationName);
    if (payload.isDemo) {
      doc
        .fillColor("#9a6b00")
        .text("DADOS DE DEMONSTRAÇÃO — não são registros de obra real.");
    }
    doc.fillColor("#222");
    doc.moveDown();
    doc.text(`Obra: ${payload.siteCode} — ${payload.siteName}`);
    if (payload.floorLabel) doc.text(`Pavimento: ${payload.floorLabel}`);
    if (payload.periodFrom || payload.periodTo) {
      doc.text(
        `Período: ${payload.periodFrom || "…"} → ${payload.periodTo || "…"}`,
      );
    }
    doc.text(
      `Emitido por ${payload.generatedBy} em ${payload.generatedAt.toISOString()}`,
    );

    doc.moveDown();
    doc.fontSize(12).fillColor("#E00024").text("Indicadores de volume");
    doc.fontSize(10).fillColor("#222");
    doc.text(`Teórico: ${ind.volumeTeoricoM3.toFixed(3)} m³`);
    doc.text(`Mapeado (estimado): ${ind.volumeEstimadoMapeadoM3.toFixed(3)} m³`);
    doc.text(`NF: ${ind.volumeNfM3.toFixed(3)} m³`);
    doc.text(`Alocado: ${ind.volumeAlocadoM3.toFixed(3)} m³`);
    doc.text(
      `Devolvido / outros destinos: ${ind.volumeDevolvidoM3.toFixed(3)} / ${ind.volumeOutrosDestinosM3.toFixed(3)} m³`,
    );
    doc.text(
      `Cobertura mapeado/teórico: ${
        ind.coverageRatio != null
          ? `${(ind.coverageRatio * 100).toFixed(1)}%`
          : "—"
      }`,
    );
    doc.moveDown(0.5);
    doc.text(ind.compare.labels.diferencaNfTeorico);
    doc.text(
      `Diferença NF − teórico: ${ind.compare.diferencaNfTeorico.toFixed(3)} m³`,
    );
    doc.text(`Saldo de carga: ${ind.compare.saldoCarga.toFixed(3)} m³`);
    doc.fillColor("#5a5a5a").text(ind.compare.labels.note);
    doc.fillColor("#222");

    doc.moveDown();
    doc.fontSize(12).fillColor("#E00024").text("Concretagens no filtro");
    doc.fontSize(10).fillColor("#222");
    if (!payload.pours.length) doc.text("Nenhuma concretagem no filtro.");
    for (const p of payload.pours) {
      doc.text(
        `• ${p.code} — ${p.title} [${p.status}]${p.pourDate ? ` · ${p.pourDate}` : ""}`,
      );
    }

    doc.moveDown();
    doc.fontSize(12).fillColor("#E00024").text("Pendências");
    doc.fontSize(10).fillColor("#222");
    if (!ind.pendencias.length) doc.text("Nenhuma pendência detectada.");
    for (const p of ind.pendencias) {
      doc.text(`• [${p.severity}] ${p.message}`);
    }

    doc.moveDown(2);
    doc
      .fontSize(8)
      .fillColor("#5a5a5a")
      .text(
        "Relatório consolidado Fase 4. Status «conforme» não é aprovação estrutural automática.",
      );
    doc.end();
  });
}

export function buildMcConsolidatedCsv(args: {
  indicators: SiteIndicators;
  pours: Array<{ code: string; title: string; status: string; pourDate: string | null }>;
}): string {
  const lines: string[] = [];
  lines.push("tipo,chave,valor");
  const ind = args.indicators;
  const rows: Array<[string, string, string | number]> = [
    ["indicador", "volume_teorico_m3", ind.volumeTeoricoM3],
    ["indicador", "volume_estimado_mapeado_m3", ind.volumeEstimadoMapeadoM3],
    ["indicador", "volume_nf_m3", ind.volumeNfM3],
    ["indicador", "volume_alocado_m3", ind.volumeAlocadoM3],
    ["indicador", "volume_devolvido_m3", ind.volumeDevolvidoM3],
    ["indicador", "volume_outros_destinos_m3", ind.volumeOutrosDestinosM3],
    [
      "indicador",
      "cobertura_ratio",
      ind.coverageRatio != null ? ind.coverageRatio : "",
    ],
    ["indicador", "diferenca_nf_teorico_m3", ind.compare.diferencaNfTeorico],
    ["indicador", "saldo_carga_m3", ind.compare.saldoCarga],
    ["indicador", "ocorrencias_abertas", ind.openOccurrences],
  ];
  for (const [t, k, v] of rows) {
    lines.push(`${t},${k},${v}`);
  }
  for (const p of args.pours) {
    lines.push(
      `concretagem,${csvEscape(p.code)},${csvEscape(`${p.status}|${p.pourDate || ""}|${p.title}`)}`,
    );
  }
  for (const p of ind.pendencias) {
    lines.push(`pendencia,${p.code},${csvEscape(p.message)}`);
  }
  return lines.join("\n") + "\n";
}

function csvEscape(s: string) {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
