import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addItemAction,
  addSectionAction,
  createNewTemplateVersionAction,
  publishTemplateVersionAction,
} from "@/actions/templates";
import {
  reorderItemsAction,
  reorderSectionsAction,
} from "@/actions/reorder";
import { requireSession, canManageTemplates } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Input, Label, Select, TextArea } from "@/components/ui/input";
import { StatusChip } from "@/components/ui/status-chip";
import { compareTemplateVersions } from "@/lib/template-version";
import type { TemplateItemMeta } from "@/lib/template-version";

export default async function TemplateDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const session = await requireSession();
  const canManage = canManageTemplates(session.role);
  const supabase = await createClient();

  const { data: template } = await supabase
    .from("checklist_templates")
    .select("*, drawing_types(name)")
    .eq("id", id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();

  if (!template) notFound();

  const versionId = template.current_version_id;
  const { data: version } = versionId
    ? await supabase
        .from("checklist_template_versions")
        .select("*")
        .eq("id", versionId)
        .single()
    : { data: null };

  const { data: sections } = versionId
    ? await supabase
        .from("checklist_sections")
        .select("*, checklist_items(*, checklist_item_media(*))")
        .eq("template_version_id", versionId)
        .order("sort_order")
    : { data: [] };

  const { data: allVersions } = await supabase
    .from("checklist_template_versions")
    .select("id, version_number, status, published_at")
    .eq("template_id", id)
    .order("version_number", { ascending: false });

  const previousPublished = (allVersions || []).find(
    (v) =>
      v.id !== versionId &&
      (v.status === "published" || v.status === "superseded"),
  );

  let versionDiff: ReturnType<typeof compareTemplateVersions> | null = null;
  if (previousPublished && version) {
    const { data: prevSections } = await supabase
      .from("checklist_sections")
      .select("checklist_items(code, title, priority, is_blocking, verifiable_parameter)")
      .eq("template_version_id", previousPublished.id);

    const flatten = (
      secs: Array<{ checklist_items: TemplateItemMeta[] | null }> | null,
    ): TemplateItemMeta[] =>
      (secs || []).flatMap((s) => s.checklist_items || []);

    const currentItems: TemplateItemMeta[] = (sections || []).flatMap(
      (s: { checklist_items?: TemplateItemMeta[] }) => s.checklist_items || [],
    );

    versionDiff = compareTemplateVersions(
      {
        version_number: previousPublished.version_number,
        status: previousPublished.status,
        items: flatten(
          prevSections as Array<{
            checklist_items: TemplateItemMeta[] | null;
          }> | null,
        ),
      },
      {
        version_number: version.version_number,
        status: version.status,
        items: currentItems,
      },
    );
  }

  const type = template.drawing_types as
    | { name: string }
    | { name: string }[]
    | null;
  const typeName = Array.isArray(type) ? type[0]?.name : type?.name;
  const isDraft = version?.status === "draft";

  return (
    <div className="space-y-6">
      <div>
        <Link href="/templates" className="text-sm text-ink-muted hover:text-ink">
          ← Templates
        </Link>
        <h2 className="mt-2 text-2xl font-semibold">{template.name}</h2>
        <p className="text-sm text-ink-muted">
          {typeName} · {template.activity_kind}
          {version ? ` · v${version.version_number} (${version.status})` : ""}
        </p>
      </div>

      {versionDiff && previousPublished && (
        <div className="rounded-lg border border-border bg-surface p-4 text-sm">
          <h3 className="font-semibold">
            Diff vs v{previousPublished.version_number} (
            {previousPublished.status})
          </h3>
          <ul className="mt-2 space-y-1 text-ink-muted">
            <li>+ adicionados: {versionDiff.added.join(", ") || "—"}</li>
            <li>− removidos: {versionDiff.removed.join(", ") || "—"}</li>
            <li>
              ~ alterados:{" "}
              {versionDiff.changed
                .map((c) => `${c.code} (${c.fields.join(", ")})`)
                .join("; ") || "—"}
            </li>
            <li>= inalterados: {versionDiff.unchanged.length}</li>
          </ul>
          <p className="mt-2 text-xs text-ink-muted">
            Runs antigos mantêm snapshot da versão usada — publicar v2 não
            reescreve conferências da v1.
          </p>
        </div>
      )}

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

      {canManage && version && (
        <div className="flex flex-wrap gap-2">
          {isDraft && (
            <form action={publishTemplateVersionAction}>
              <input type="hidden" name="template_id" value={id} />
              <input type="hidden" name="version_id" value={version.id} />
              <input type="hidden" name="snapshot_note" value="Publicação MVP" />
              <Button type="submit">Publicar esta versão</Button>
            </form>
          )}
          {version.status === "published" && (
            <form action={createNewTemplateVersionAction}>
              <input type="hidden" name="template_id" value={id} />
              <Button type="submit" variant="secondary">
                Nova versão (rascunho) a partir desta
              </Button>
            </form>
          )}
        </div>
      )}

      <section className="space-y-4">
        {(sections || []).map((section) => (
          <div
            key={section.id}
            className="rounded-lg border border-border bg-surface p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-semibold">{section.title}</h3>
              {canManage && isDraft && version && (
                <div className="flex gap-1">
                  <form action={reorderSectionsAction}>
                    <input type="hidden" name="template_id" value={id} />
                    <input type="hidden" name="version_id" value={version.id} />
                    <input type="hidden" name="section_id" value={section.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button type="submit" size="sm" variant="ghost">
                      ↑ seção
                    </Button>
                  </form>
                  <form action={reorderSectionsAction}>
                    <input type="hidden" name="template_id" value={id} />
                    <input type="hidden" name="version_id" value={version.id} />
                    <input type="hidden" name="section_id" value={section.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button type="submit" size="sm" variant="ghost">
                      ↓ seção
                    </Button>
                  </form>
                </div>
              )}
            </div>
            <ul className="mt-3 divide-y divide-divider text-sm">
              {(section.checklist_items || []).map(
                (item: {
                  id: string;
                  code: string;
                  title: string;
                  priority: string;
                  is_blocking: boolean;
                  verifiable_parameter: string | null;
                  checklist_item_media: unknown[];
                }) => (
                  <li key={item.id} className="py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">
                        {item.code} — {item.title}
                      </span>
                      <StatusChip label={item.priority} tone="neutral" />
                      {item.is_blocking && (
                        <StatusChip label="Bloqueante" tone="danger" />
                      )}
                      {(item.checklist_item_media?.length || 0) > 0 && (
                        <StatusChip
                          label={`${item.checklist_item_media.length} mídia(s)`}
                          tone="info"
                        />
                      )}
                      {canManage && isDraft && version && (
                        <>
                          <form action={reorderItemsAction}>
                            <input type="hidden" name="template_id" value={id} />
                            <input
                              type="hidden"
                              name="version_id"
                              value={version.id}
                            />
                            <input type="hidden" name="item_id" value={item.id} />
                            <input type="hidden" name="direction" value="up" />
                            <Button type="submit" size="sm" variant="ghost">
                              ↑
                            </Button>
                          </form>
                          <form action={reorderItemsAction}>
                            <input type="hidden" name="template_id" value={id} />
                            <input
                              type="hidden"
                              name="version_id"
                              value={version.id}
                            />
                            <input type="hidden" name="item_id" value={item.id} />
                            <input type="hidden" name="direction" value="down" />
                            <Button type="submit" size="sm" variant="ghost">
                              ↓
                            </Button>
                          </form>
                        </>
                      )}
                    </div>
                    {item.verifiable_parameter && (
                      <p className="text-ink-muted">{item.verifiable_parameter}</p>
                    )}
                  </li>
                ),
              )}
            </ul>
          </div>
        ))}
      </section>

      {canManage && isDraft && version && (
        <div className="grid gap-4 lg:grid-cols-2">
          <form
            action={addSectionAction}
            className="space-y-3 rounded-lg border border-border bg-surface p-4"
          >
            <h3 className="font-semibold">Adicionar seção</h3>
            <input type="hidden" name="template_id" value={id} />
            <input type="hidden" name="version_id" value={version.id} />
            <div>
              <Label htmlFor="title">Título</Label>
              <Input id="title" name="title" required />
            </div>
            <Button type="submit" variant="secondary">
              Adicionar seção
            </Button>
          </form>

          <form
            action={addItemAction}
            className="space-y-3 rounded-lg border border-border bg-surface p-4"
          >
            <h3 className="font-semibold">Adicionar item</h3>
            <input type="hidden" name="template_id" value={id} />
            <input type="hidden" name="version_id" value={version.id} />
            <div>
              <Label>Seção</Label>
              <Select name="section_id" required>
                <option value="">Selecione…</option>
                {(sections || []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title}
                  </option>
                ))}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Código</Label>
                <Input name="code" required placeholder="VIG-01" />
              </div>
              <div>
                <Label>Prioridade</Label>
                <Select name="priority" defaultValue="media">
                  <option value="baixa">Baixa</option>
                  <option value="media">Média</option>
                  <option value="alta">Alta</option>
                  <option value="critica">Crítica</option>
                </Select>
              </div>
            </div>
            <div>
              <Label>Título</Label>
              <Input name="title" required />
            </div>
            <div>
              <Label>Objetivo</Label>
              <TextArea name="objective" rows={2} />
            </div>
            <div>
              <Label>Passo a passo (1 por linha)</Label>
              <TextArea name="steps" rows={3} />
            </div>
            <div>
              <Label>Parâmetro verificável</Label>
              <Input name="verifiable_parameter" />
            </div>
            <div>
              <Label>Critério de aceitação</Label>
              <Input name="acceptance_criteria" />
            </div>
            <div>
              <Label>Referência técnica (texto livre)</Label>
              <Input
                name="technical_reference"
                placeholder="Ex.: NBR 6118 — verificar edição vigente"
              />
            </div>
            <div>
              <Label>URL imagem destaque</Label>
              <Input name="media_url" placeholder="https://..." />
            </div>
            <div>
              <Label>Legenda da imagem</Label>
              <Input name="media_caption" />
            </div>
            <div>
              <Label>URL vídeo (opcional)</Label>
              <Input name="video_url" placeholder="https://..." />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="is_blocking" />
              Item bloqueante
            </label>
            <Button type="submit">Adicionar item</Button>
          </form>
        </div>
      )}
    </div>
  );
}
