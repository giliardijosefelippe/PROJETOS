import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { Input, Label, Select } from "@/components/ui/input";

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string }>;
}) {
  const session = await requireSession();
  const filters = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("projects")
    .select("id, code, name, status, description, created_at")
    .eq("organization_id", session.organizationId)
    .order("created_at", { ascending: false });

  if (filters.status === "active" || filters.status === "archived") {
    query = query.eq("status", filters.status);
  }
  if (filters.q?.trim()) {
    query = query.or(
      `code.ilike.%${filters.q.trim()}%,name.ilike.%${filters.q.trim()}%`,
    );
  }

  const { data: projects } = await query;

  const canCreate =
    session.role === "admin" || session.role === "coordenador";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">Projetos</h2>
          <p className="text-sm text-ink-muted">
            Cadastro de projetos, pranchas e revisões.
          </p>
        </div>
        {canCreate && (
          <Link href="/projects/new">
            <Button>Novo projeto</Button>
          </Link>
        )}
      </div>

      <form className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-surface p-3">
        <div>
          <Label htmlFor="q">Busca</Label>
          <Input
            id="q"
            name="q"
            defaultValue={filters.q || ""}
            placeholder="Código ou nome"
          />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select id="status" name="status" defaultValue={filters.status || ""}>
            <option value="">Todos</option>
            <option value="active">Ativo</option>
            <option value="archived">Arquivado</option>
          </Select>
        </div>
        <Button type="submit" variant="secondary">
          Filtrar
        </Button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-divider bg-muted text-ink-muted">
            <tr>
              <th className="px-4 py-2 font-medium">Código</th>
              <th className="px-4 py-2 font-medium">Nome</th>
              <th className="px-4 py-2 font-medium">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {(projects || []).map((p) => (
              <tr key={p.id} className="hover:bg-muted/60">
                <td className="px-4 py-3">
                  <Link
                    href={`/projects/${p.id}`}
                    className="font-medium text-brand"
                  >
                    {p.code}
                  </Link>
                </td>
                <td className="px-4 py-3">{p.name}</td>
                <td className="px-4 py-3">
                  <StatusChip
                    label={p.status === "active" ? "Ativo" : "Arquivado"}
                    tone={p.status === "active" ? "ok" : "neutral"}
                  />
                </td>
              </tr>
            ))}
            {!projects?.length && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-ink-muted">
                  Nenhum projeto com estes filtros.
                  {canCreate ? " Crie o primeiro ou rode o seed." : ""}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
