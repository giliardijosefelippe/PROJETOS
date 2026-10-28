import Link from "next/link";
import { notFound } from "next/navigation";
import { createDrawingAction } from "@/actions/projects";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { WORKFLOW_LABELS } from "@/lib/types/domain";
import { StatusChip, workflowTone } from "@/components/ui/status-chip";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const session = await requireSession();
  const supabase = await createClient();

  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!project) notFound();

  const { data: drawings } = await supabase
    .from("drawings")
    .select(
      "id, number, title, level_label, drawing_types(name), drawing_revisions(id, revision_code, workflow_status, created_at)",
    )
    .eq("project_id", id)
    .order("number");

  const { data: types } = await supabase
    .from("drawing_types")
    .select("id, code, name")
    .eq("organization_id", session.organizationId)
    .eq("active", true)
    .order("sort_order");

  const canEdit =
    session.role === "admin" ||
    session.role === "coordenador" ||
    session.role === "desenhista";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/projects" className="text-sm text-ink-muted hover:text-ink">
          ← Projetos
        </Link>
        <h2 className="mt-2 text-2xl font-semibold">
          {project.code} — {project.name}
        </h2>
        {project.description && (
          <p className="text-sm text-ink-muted">{project.description}</p>
        )}
      </div>

      {q.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] p-3 text-sm text-[var(--color-status-danger)]">
          <span aria-hidden="true">✕ </span>
          {q.error}
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Pranchas</h3>
        <ul className="mt-3 divide-y divide-divider">
          {(drawings || []).map((d) => {
            const type = d.drawing_types as { name: string } | { name: string }[] | null;
            const typeName = Array.isArray(type) ? type[0]?.name : type?.name;
            const revs = (d.drawing_revisions || []) as Array<{
              id: string;
              revision_code: string;
              workflow_status: string;
            }>;
            const latest = revs[0];
            return (
              <li key={d.id} className="py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium">
                      {d.number} — {d.title}
                    </p>
                    <p className="text-ink-muted">
                      {typeName}
                      {d.level_label ? ` · ${d.level_label}` : ""}
                    </p>
                  </div>
                  {latest && (
                    <Link href={`/revisions/${latest.id}`} className="flex items-center gap-2">
                      <span>{latest.revision_code}</span>
                      <StatusChip
                        label={
                          WORKFLOW_LABELS[
                            latest.workflow_status as keyof typeof WORKFLOW_LABELS
                          ]
                        }
                        tone={workflowTone(latest.workflow_status)}
                      />
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
          {!drawings?.length && (
            <li className="py-3 text-ink-muted">Nenhuma prancha neste projeto.</li>
          )}
        </ul>
      </section>

      {canEdit && (
        <section className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Nova prancha + revisão inicial</h3>
          <form action={createDrawingAction} className="mt-3 grid gap-3 sm:grid-cols-2">
            <input type="hidden" name="project_id" value={project.id} />
            <div className="sm:col-span-2">
              <Label htmlFor="drawing_type_id">Categoria</Label>
              <Select id="drawing_type_id" name="drawing_type_id" required>
                <option value="">Selecione…</option>
                {(types || []).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="number">Número</Label>
              <Input id="number" name="number" required placeholder="EX: FOR-01" />
            </div>
            <div>
              <Label htmlFor="revision_code">Revisão</Label>
              <Input id="revision_code" name="revision_code" defaultValue="R00" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="title">Título</Label>
              <Input id="title" name="title" required />
            </div>
            <div>
              <Label htmlFor="level_label">Pavimento / nível</Label>
              <Input id="level_label" name="level_label" placeholder="Térreo" />
            </div>
            <div className="flex items-end">
              <Button type="submit">Criar prancha</Button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
