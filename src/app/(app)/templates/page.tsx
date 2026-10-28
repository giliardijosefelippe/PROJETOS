import Link from "next/link";
import { createTemplateAction } from "@/actions/templates";
import { requireSession, canManageTemplates } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireSession();
  const q = await searchParams;
  const supabase = await createClient();
  const canManage = canManageTemplates(session.role);

  const { data: templates } = await supabase
    .from("checklist_templates")
    .select(
      "id, name, activity_kind, status, drawing_types(name), current_version_id, checklist_template_versions!checklist_templates_current_version_id_fkey(version_number, status)",
    )
    .eq("organization_id", session.organizationId)
    .order("name");

  const { data: types } = await supabase
    .from("drawing_types")
    .select("id, name")
    .eq("organization_id", session.organizationId)
    .eq("active", true)
    .order("sort_order");

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold">Templates de checklist</h2>
        <p className="text-sm text-ink-muted">
          Biblioteca editável. Publicar gera versão imutável para runs.
        </p>
      </div>

      {q.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] p-3 text-sm text-[var(--color-status-danger)]">
          <span aria-hidden="true">✕ </span>
          {q.error}
        </p>
      )}

      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-divider bg-muted text-ink-muted">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">Categoria</th>
              <th className="px-4 py-2">Atividade</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Versão</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {(templates || []).map((t) => {
              const dt = t.drawing_types as
                | { name: string }
                | { name: string }[]
                | null;
              const typeName = Array.isArray(dt) ? dt[0]?.name : dt?.name;
              const ver = t.checklist_template_versions as
                | { version_number: number; status: string }
                | { version_number: number; status: string }[]
                | null;
              const v = Array.isArray(ver) ? ver[0] : ver;
              return (
                <tr key={t.id}>
                  <td className="px-4 py-3">
                    <Link href={`/templates/${t.id}`} className="font-medium text-brand">
                      {t.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{typeName}</td>
                  <td className="px-4 py-3 capitalize">{t.activity_kind}</td>
                  <td className="px-4 py-3">
                    <StatusChip
                      label={t.status}
                      tone={
                        t.status === "published"
                          ? "ok"
                          : t.status === "disabled"
                            ? "neutral"
                            : "warn"
                      }
                    />
                  </td>
                  <td className="px-4 py-3">
                    {v ? `v${v.version_number} (${v.status})` : "—"}
                  </td>
                </tr>
              );
            })}
            {!templates?.length && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-ink-muted">
                  Nenhum template. Rode <code>npm run seed</code> ou crie abaixo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canManage && (
        <form
          action={createTemplateAction}
          className="grid max-w-2xl gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2"
        >
          <h3 className="sm:col-span-2 font-semibold">Novo template</h3>
          <div className="sm:col-span-2">
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required />
          </div>
          <div>
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
            <Label htmlFor="activity_kind">Atividade</Label>
            <Select id="activity_kind" name="activity_kind" required>
              <option value="producao">Produção</option>
              <option value="conferencia">Conferência</option>
            </Select>
          </div>
          <div>
            <Button type="submit">Criar rascunho</Button>
          </div>
        </form>
      )}
    </div>
  );
}
