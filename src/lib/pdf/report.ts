import PDFDocument from "pdfkit";

export type ReportPayload = {
  reportType: "producao" | "conferencia" | "pendencias" | "resumo";
  organizationName: string;
  logoBuffer?: Buffer | null;
  projectCode: string;
  projectName: string;
  drawingNumber: string;
  drawingTitle: string;
  revisionCode: string;
  templateName?: string;
  templateVersion?: number;
  authorName?: string;
  reviewerName?: string;
  generatedBy: string;
  generatedAt: Date;
  items: Array<{
    code: string;
    title: string;
    status: string;
    comment?: string | null;
    blocking?: boolean;
  }>;
  issues?: Array<{
    code: string;
    title: string;
    status: string;
    priority: string;
    description?: string | null;
  }>;
  summary: {
    conforme: number;
    nao_conforme: number;
    nao_aplicavel: number;
    pendente: number;
    nao_iniciado: number;
    conformidade: number | null;
    cobertura: number | null;
  };
  approvalNote?: string | null;
};

const TYPE_LABELS = {
  producao: "Relatório de produção do desenhista",
  conferencia: "Relatório de conferência técnica",
  pendencias: "Relatório de pendências e correções",
  resumo: "Resumo por projeto / prancha",
};

function pct(n: number | null) {
  if (n == null) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

export async function buildReportPdf(payload: ReportPayload): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: "A4" });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const brandRed = "#E00024";
    const ink = "#222222";

    if (payload.logoBuffer) {
      try {
        doc.image(payload.logoBuffer, 50, 40, { height: 36 });
      } catch {
        // placeholder if image invalid
      }
    } else {
      doc.fillColor(brandRed).fontSize(14).font("Helvetica-Bold").text("LUNARDELI", 50, 45);
      doc.fillColor(ink).fontSize(9).font("Helvetica").text("ENGENHARIA", 50, 62);
    }

    doc
      .fillColor(ink)
      .fontSize(11)
      .font("Helvetica-Bold")
      .text("Lunardeli Engenharia — Gestão e Qualidade de Projetos Estruturais", 50, 90, {
        width: 500,
      });

    doc
      .moveDown(0.5)
      .fontSize(14)
      .text(TYPE_LABELS[payload.reportType]);

    doc
      .moveDown(0.4)
      .fontSize(9)
      .font("Helvetica")
      .fillColor("#5a5a5a")
      .text(
        `Gerado em ${payload.generatedAt.toLocaleString("pt-BR")} por ${payload.generatedBy}`,
      )
      .text(
        "Aprovação interna de usuário autenticado — não constitui assinatura digital juridicamente válida.",
      );

    doc.moveDown(0.8).fillColor(ink).fontSize(10).font("Helvetica-Bold").text("Identificação");
    doc.font("Helvetica").fontSize(9);
    doc.text(`Organização: ${payload.organizationName}`);
    doc.text(`Projeto: ${payload.projectCode} — ${payload.projectName}`);
    doc.text(`Prancha: ${payload.drawingNumber} — ${payload.drawingTitle}`);
    doc.text(`Revisão: ${payload.revisionCode}`);
    if (payload.templateName) {
      doc.text(
        `Template: ${payload.templateName}${payload.templateVersion != null ? ` (v${payload.templateVersion})` : ""}`,
      );
    }
    if (payload.authorName) doc.text(`Produção: ${payload.authorName}`);
    if (payload.reviewerName) doc.text(`Conferência: ${payload.reviewerName}`);

    doc.moveDown(0.6).font("Helvetica-Bold").fontSize(10).text("Indicadores");
    doc.font("Helvetica").fontSize(9);
    const s = payload.summary;
    doc.text(
      `Conformes: ${s.conforme} | Não conformes: ${s.nao_conforme} | N/A: ${s.nao_aplicavel} | Pendentes: ${s.pendente} | Não iniciados: ${s.nao_iniciado}`,
    );
    doc.text(
      `Taxa de conformidade = conformes / (conformes + não conformes) = ${pct(s.conformidade)}`,
    );
    doc.text(`Cobertura (avaliados aplicáveis) = ${pct(s.cobertura)}`);

    if (payload.items.length) {
      doc.moveDown(0.6).font("Helvetica-Bold").fontSize(10).text("Itens e respostas");
      doc.font("Helvetica").fontSize(8);
      for (const item of payload.items) {
        const block = item.blocking ? " [bloqueante]" : "";
        doc.text(
          `${item.code} — ${item.title}${block} | ${item.status}${item.comment ? ` | ${item.comment}` : ""}`,
          { width: 500 },
        );
        doc.moveDown(0.15);
      }
    }

    if (payload.issues?.length) {
      doc.moveDown(0.5).font("Helvetica-Bold").fontSize(10).text("Pendências");
      doc.font("Helvetica").fontSize(8);
      for (const issue of payload.issues) {
        doc.text(
          `${issue.code} [${issue.priority}/${issue.status}] ${issue.title}${issue.description ? ` — ${issue.description}` : ""}`,
          { width: 500 },
        );
        doc.moveDown(0.15);
      }
    }

    if (payload.approvalNote) {
      doc.moveDown(0.5).font("Helvetica-Bold").fontSize(10).text("Observações de aprovação");
      doc.font("Helvetica").fontSize(9).text(payload.approvalNote);
    }

    doc
      .moveDown(1.2)
      .fontSize(9)
      .font("Helvetica")
      .text("______________________________          ______________________________")
      .text("Assinatura produção (registro)                    Assinatura conferência (registro)");

    doc.end();
  });
}
