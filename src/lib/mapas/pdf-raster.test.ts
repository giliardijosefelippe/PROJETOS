import { describe, it } from "node:test";
import assert from "node:assert/strict";
import PDFDocument from "pdfkit";
import { renderPdfPageToPng } from "./pdf-raster";
import { buildMcPourReportPdf } from "./report";
import { compareVolumes } from "./geometry";

function tinyPdf(): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: [400, 280], margin: 24 });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c as Buffer));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(14).fillColor("#E00024").text("DEMONSTRAÇÃO — fixture relatório");
    doc.rect(40, 80, 200, 120).stroke("#222");
    doc.end();
  });
}

describe("MapaConcreto PDF raster + report preview", () => {
  it("rasterizes a real PDF page to PNG without inventing geometry", async () => {
    const pdf = await tinyPdf();
    const raster = await renderPdfPageToPng(pdf, { page: 1, scale: 1.2 });
    assert.ok(raster);
    assert.ok(raster!.png.length > 100);
    assert.equal(raster!.png.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
    assert.ok(raster!.width > 10);
    assert.ok(raster!.height > 10);
    assert.equal(raster!.page, 1);
  });

  it("embeds plant preview PNG into pour report PDF", async () => {
    const pdfBytes = await tinyPdf();
    const raster = await renderPdfPageToPng(pdfBytes, { maxWidthPx: 800 });
    assert.ok(raster);

    const report = await buildMcPourReportPdf({
      organizationName: "Org Demo",
      siteCode: "DEMO-MC-001",
      siteName: "Obra Demo",
      pourCode: "C-DEMO-01",
      pourTitle: "Etapa 1",
      pourDate: "2026-11-12",
      isDemo: true,
      generatedBy: "Teste",
      generatedAt: new Date("2026-11-12T12:00:00Z"),
      plantPreviewPng: raster!.png,
      plantPreviewLabel: "Raster fixture página 1",
      regions: [
        {
          name: "A",
          areaM2: 25,
          tool: "rectangle",
          ringM: [
            [0, 0],
            [5, 0],
            [5, 5],
            [0, 5],
            [0, 0],
          ],
          color: "#E00024",
        },
      ],
      elements: [
        {
          code: "LJ-DEMO-40",
          name: "Laje",
          kind: "laje",
          percent: 62.5,
          volumeEstimadoM3: 3.75,
          volumeTeoricoM3: 6,
        },
      ],
      deliveries: [
        { nf: "NF-DEMO-1001", plate: "DEM0A00", volumeNfM3: 4, allocatedM3: 3.8 },
      ],
      slumps: [
        { nf: "NF-DEMO-1001", measuredMm: 95, specMm: 100, compliant: true },
      ],
      compare: compareVolumes({
        volumeTeoricoM3: 6,
        volumeEstimadoMapeadoM3: 3.75,
        volumeNfM3: 4,
        volumeAlocadoM3: 3.8,
        volumeDevolvidoM3: 0.2,
        volumeOutrosDestinosM3: 0,
      }),
      warnings: [],
    });

    assert.ok(report.length > 500);
    assert.equal(report.subarray(0, 4).toString(), "%PDF");
  });

  it("returns null for empty bytes (no invented preview)", async () => {
    const raster = await renderPdfPageToPng(Buffer.alloc(0));
    assert.equal(raster, null);
  });
});
