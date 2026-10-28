import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDateTime } from "@/lib/utils";

export default async function ReportsPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: exports } = await supabase
    .from("report_exports")
    .select("id, report_type, generated_at, revision_id, storage_path")
    .eq("organization_id", session.organizationId)
    .order("generated_at", { ascending: false })
    .limit(50);

  const { data: revisions } = await supabase
    .from("drawing_revisions")
    .select("id, revision_code, drawings(number, title, projects(code))")
    .eq("organization_id", session.organizationId)
    .order("updated_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Relatórios</h2>
        <p className="text-sm text-ink-muted">
          PDFs gerados no servidor (produção, conferência, pendências, resumo).
          Gere a partir da tela da revisão.
        </p>
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Revisões recentes</h3>
        <ul className="mt-3 divide-y divide-divider text-sm">
          {(revisions || []).map((r) => {
            const d = r.drawings as unknown as {
              number: string;
              title: string;
              projects: { code: string } | { code: string }[];
            };
            const p = Array.isArray(d?.projects) ? d.projects[0] : d?.projects;
            return (
              <li key={r.id} className="flex justify-between py-2">
                <span>
                  {p?.code} · {d?.number} · {r.revision_code} — {d?.title}
                </span>
                <Link href={`/revisions/${r.id}`} className="text-brand">
                  Abrir / gerar PDF
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Exportações recentes</h3>
        <ul className="mt-3 divide-y divide-divider text-sm">
          {(exports || []).map((e) => (
            <li key={e.id} className="py-2">
              <span className="font-medium capitalize">{e.report_type}</span>
              {" · "}
              {formatDateTime(e.generated_at)}
              {e.revision_id && (
                <>
                  {" · "}
                  <Link
                    href={`/revisions/${e.revision_id}`}
                    className="text-brand"
                  >
                    revisão
                  </Link>
                </>
              )}
              {e.storage_path && (
                <p className="text-xs text-ink-muted">{e.storage_path}</p>
              )}
            </li>
          ))}
          {!exports?.length && (
            <li className="py-2 text-ink-muted">
              Nenhum PDF gerado ainda. Requer buckets Supabase configurados.
            </li>
          )}
        </ul>
      </section>
    </div>
  );
}
