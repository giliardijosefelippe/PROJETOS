import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteAnnotationAction } from "@/actions/annotations";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AnnotationBoard } from "@/components/annotations/annotation-board";
import { PresenceBar } from "@/components/presence/presence-bar";
import { Button } from "@/components/ui/button";

export default async function AnnotationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const { data: revision } = await supabase
    .from("drawing_revisions")
    .select(
      "id, revision_code, immutable, drawings(number, title, projects(code))",
    )
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!revision) notFound();

  const { data: annotations, error } = await supabase
    .from("drawing_annotations")
    .select("id, x, y, label, note, color, page_number")
    .eq("revision_id", id)
    .order("created_at");

  const drawing = revision.drawings as unknown as {
    number?: string;
    title?: string;
    projects?: { code: string } | { code: string }[];
  };
  const project = drawing?.projects;
  const projectCode = Array.isArray(project) ? project[0]?.code : project?.code;

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/revisions/${id}`}
          className="text-sm text-ink-muted hover:text-ink"
        >
          ← Revisão {revision.revision_code}
        </Link>
        <h2 className="mt-2 text-2xl font-semibold">Marcações na prancha</h2>
        <p className="text-sm text-ink-muted">
          {projectCode} · {drawing?.number} — {drawing?.title}.
          Coordenadas normalizadas; overlay MVP (PDF.js pleno = evolução).
        </p>
      </div>

      <PresenceBar revisionId={id} />

      {q.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] p-3 text-sm text-[var(--color-status-danger)]">
          <span aria-hidden="true">✕ </span>
          {q.error}
        </p>
      )}
      {q.ok && (
        <p className="rounded-md bg-[var(--color-status-ok-bg)] p-3 text-sm text-[var(--color-status-ok)]">
          <span aria-hidden="true">✓ </span>
          {q.ok}
        </p>
      )}
      {error && (
        <p className="rounded-md bg-[var(--color-status-warn-bg)] p-3 text-sm">
          <span aria-hidden="true">! </span>
          Tabela de anotações indisponível — aplique{" "}
          <code>supabase/migrations/00005_etapa_d.sql</code>. ({error.message})
        </p>
      )}

      <AnnotationBoard
        revisionId={id}
        immutable={revision.immutable}
        annotations={(annotations || []).map((a) => ({
          id: a.id,
          x: Number(a.x),
          y: Number(a.y),
          label: a.label,
          note: a.note,
          color: a.color,
          page_number: a.page_number,
        }))}
      />

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Lista de marcações</h3>
        <ul className="mt-2 divide-y divide-divider text-sm">
          {(annotations || []).map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span>
                <strong>{a.label}</strong> — p.{a.page_number} ({a.x}, {a.y})
                {a.note ? ` · ${a.note}` : ""}
              </span>
              {!revision.immutable && (
                <form action={deleteAnnotationAction}>
                  <input type="hidden" name="revision_id" value={id} />
                  <input type="hidden" name="annotation_id" value={a.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Remover
                  </Button>
                </form>
              )}
            </li>
          ))}
          {!annotations?.length && (
            <li className="py-2 text-ink-muted">Nenhuma marcação ainda.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
