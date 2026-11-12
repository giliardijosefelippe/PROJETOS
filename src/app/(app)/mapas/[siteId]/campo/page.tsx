import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  createFieldNoteAction,
  createOccurrenceAction,
  uploadFieldPhotoAction,
} from "@/actions/mapas/gestao";
import { SiteNav } from "@/components/mapas/site-nav";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export default async function CampoPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession();
  const { siteId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: site } = await supabase
    .from("mc_sites")
    .select("id, code, name")
    .eq("id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!site) notFound();

  const { data: pours } = await supabase
    .from("mc_concrete_pours")
    .select("id, code, title, status")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: notes } = await supabase
    .from("mc_field_notes")
    .select("id, note, pour_id, created_at")
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: occurrences } = await supabase
    .from("mc_site_occurrences")
    .select(
      "id, title, severity, status, responsible_name, due_date, created_at",
    )
    .eq("site_id", siteId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="mx-auto max-w-lg space-y-4 pb-10">
      <SiteNav siteId={siteId} current="/campo" />
      <div>
        <Link
          href={`/mapas/${siteId}`}
          className="text-sm text-ink-muted hover:underline"
        >
          ← {site.code}
        </Link>
        <h2 className="mt-1 text-2xl font-semibold">Campo</h2>
        <p className="text-sm text-ink-muted">
          Consulta rápida, foto, nota e ocorrência — layout móvel. Desenho de
          planta permanece no desktop.
        </p>
      </div>

      {sp.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] px-3 py-2 text-sm text-[var(--color-status-danger)]">
          {sp.error}
        </p>
      )}
      {sp.ok && (
        <p className="rounded-md bg-[var(--color-status-ok-bg)] px-3 py-2 text-sm text-[var(--color-status-ok)]">
          Salvo ({sp.ok}).
        </p>
      )}

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Últimas concretagens</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {(pours || []).map((p) => (
            <li key={p.id}>
              <Link
                href={`/mapas/${siteId}/concretagens/${p.id}`}
                className="font-medium underline"
              >
                {p.code}
              </Link>{" "}
              <span className="text-ink-muted">
                {p.title} · {p.status}
              </span>
            </li>
          ))}
          {(pours || []).length === 0 && (
            <li className="text-ink-muted">Nenhuma concretagem.</li>
          )}
        </ul>
      </section>

      <form
        action={uploadFieldPhotoAction}
        encType="multipart/form-data"
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
      >
        <h3 className="font-semibold">Foto de campo</h3>
        <input type="hidden" name="site_id" value={siteId} />
        <div>
          <Label htmlFor="photo_pour">Concretagem (opcional)</Label>
          <Select id="photo_pour" name="pour_id" defaultValue="">
            <option value="">Obra</option>
            {(pours || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="description">Descrição</Label>
          <Input id="description" name="description" placeholder="Frente N / laje" />
        </div>
        <Input
          id="file"
          name="file"
          type="file"
          accept="image/*,application/pdf"
          required
          capture="environment"
        />
        <Button type="submit" className="w-full">
          Enviar foto
        </Button>
      </form>

      <form
        action={createFieldNoteAction}
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
      >
        <h3 className="font-semibold">Nota rápida</h3>
        <input type="hidden" name="site_id" value={siteId} />
        <div>
          <Label htmlFor="note_pour">Concretagem (opcional)</Label>
          <Select id="note_pour" name="pour_id" defaultValue="">
            <option value="">Obra</option>
            {(pours || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="note">Nota</Label>
          <Input id="note" name="note" required placeholder="Observação de campo" />
        </div>
        <Button type="submit" className="w-full" variant="secondary">
          Salvar nota
        </Button>
      </form>

      <form
        action={createOccurrenceAction}
        className="space-y-3 rounded-lg border border-border bg-surface p-4"
      >
        <h3 className="font-semibold">Ocorrência</h3>
        <input type="hidden" name="site_id" value={siteId} />
        <input type="hidden" name="redirect_to" value={`/mapas/${siteId}/campo`} />
        <div>
          <Label htmlFor="occ_pour">Concretagem (opcional)</Label>
          <Select id="occ_pour" name="pour_id" defaultValue="">
            <option value="">Obra</option>
            {(pours || []).map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="title">Título</Label>
          <Input id="title" name="title" required />
        </div>
        <div>
          <Label htmlFor="severity">Severidade</Label>
          <Select id="severity" name="severity" defaultValue="media">
            <option value="baixa">Baixa</option>
            <option value="media">Média</option>
            <option value="alta">Alta</option>
            <option value="critica">Crítica</option>
          </Select>
        </div>
        <div>
          <Label htmlFor="responsible_name">Responsável</Label>
          <Input id="responsible_name" name="responsible_name" />
        </div>
        <div>
          <Label htmlFor="due_date">Prazo</Label>
          <Input id="due_date" name="due_date" type="date" />
        </div>
        <div>
          <Label htmlFor="corrective_action">Ação corretiva</Label>
          <Input id="corrective_action" name="corrective_action" />
        </div>
        <div>
          <Label htmlFor="description">Descrição</Label>
          <Input id="description" name="description" />
        </div>
        <Button type="submit" className="w-full">
          Registrar ocorrência
        </Button>
      </form>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Ocorrências recentes</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {(occurrences || []).map((o) => (
            <li key={o.id}>
              <Badge>{o.severity}</Badge> <Badge>{o.status}</Badge> {o.title}
              <p className="text-xs text-ink-muted">
                {o.responsible_name || "—"}
                {o.due_date ? ` · prazo ${o.due_date}` : ""}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Notas recentes</h3>
        <ul className="mt-2 space-y-2 text-sm">
          {(notes || []).map((n) => (
            <li key={n.id} className="text-ink-muted">
              {n.note}
              <span className="block text-xs">
                {new Date(n.created_at).toLocaleString("pt-BR", {
                  timeZone: "America/Sao_Paulo",
                })}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
