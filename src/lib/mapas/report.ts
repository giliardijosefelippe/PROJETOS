import PDFDocument from "pdfkit";
import type { VolumeCompareResult } from "./geometry";

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
