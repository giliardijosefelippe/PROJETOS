import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createSiteAction } from "@/actions/mapas/sites";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export default async function NovaObraPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSession(["admin", "coordenador", "desenhista"]);
  const sp = await searchParams;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <Link href="/mapas" className="text-sm text-ink-muted hover:underline">
          ← Obras
        </Link>
        <h2 className="mt-2 text-2xl font-semibold">Nova obra</h2>
        <p className="text-sm text-ink-muted">
          Cria obra, torre/bloco e pavimento iniciais.
        </p>
      </div>
      {sp.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] px-3 py-2 text-sm text-[var(--color-status-danger)]">
          {sp.error}
        </p>
      )}
      <form action={createSiteAction} className="space-y-3 rounded-lg border border-border bg-surface p-4">
        <div>
          <Label htmlFor="code">Código</Label>
          <Input id="code" name="code" required placeholder="OBRA-001" />
        </div>
        <div>
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" required placeholder="Residencial Exemplo" />
        </div>
        <div>
          <Label htmlFor="description">Descrição</Label>
          <Input id="description" name="description" />
        </div>
        <div>
          <Label htmlFor="building_name">Torre / bloco</Label>
          <Input id="building_name" name="building_name" defaultValue="Torre A" />
        </div>
        <div>
          <Label htmlFor="floor_name">Pavimento</Label>
          <Input id="floor_name" name="floor_name" defaultValue="Pavimento tipo" />
        </div>
        <Button type="submit">Criar obra</Button>
      </form>
    </div>
  );
}
