import Link from "next/link";
import { requireSession } from "@/lib/auth";

const ITEMS = [
  {
    title: "PRUMO",
    status: "Stub / contrato",
    body: "Sem cliente HTTP nem credenciais. Defina o contrato de API antes de implementar. Ver docs/integrations/README.md.",
  },
  {
    title: "DWG / IFC",
    status: "Stub de visualização",
    body: "Viewer especializado fora do escopo MVP. Use marcações com coordenadas normalizadas na revisão; plugar conversor/serviço depois.",
  },
  {
    title: "IA — inconsistências",
    status: "Stub com revisão humana",
    body: "Gera dicas em ai_suggestions (pending_human_review). Nunca trata resultado como interpretação estrutural validada.",
  },
  {
    title: "Excel / CSV",
    status: "Disponível",
    body: "Export/import CSV (Excel). Modelo de importação e export de checklist/revisão nas telas de template e revisão.",
  },
  {
    title: "Comparação de revisões",
    status: "Disponível",
    body: "Diff de respostas entre duas revisões em /revisions/compare.",
  },
  {
    title: "Marcações PDF",
    status: "MVP coordenadas",
    body: "Overlay clicável + drawing_annotations. PDF.js pleno quando o arquivo estiver no Storage.",
  },
];

export default async function IntegrationsPage() {
  await requireSession();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Integrações e evolução (D)</h2>
        <p className="text-sm text-ink-muted">
          Fundações utilizáveis onde possível; stubs explícitos onde falta
          serviço externo. Não fingimos PRUMO/DWG/IFC/IA “já integrados”.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        {ITEMS.map((item) => (
          <article
            key={item.title}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold text-ink">{item.title}</h3>
              <span className="rounded bg-muted px-2 py-0.5 text-xs text-ink-muted">
                {item.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-ink-muted">{item.body}</p>
          </article>
        ))}
      </div>

      <p className="text-sm">
        Documentação:{" "}
        <code className="text-xs">docs/integrations/README.md</code> ·{" "}
        <Link href="/revisions/compare" className="text-brand">
          Comparar revisões
        </Link>{" "}
        ·{" "}
        <a
          href="/api/export/template-csv-template"
          className="text-brand"
        >
          Baixar modelo CSV
        </a>
      </p>
    </div>
  );
}
