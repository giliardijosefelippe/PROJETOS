import { createProjectAction } from "@/actions/projects";
import { requireSession } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input, Label, TextArea } from "@/components/ui/input";
import Link from "next/link";

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await requireSession(["admin", "coordenador"]);
  const params = await searchParams;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <Link href="/projects" className="text-sm text-ink-muted hover:text-ink">
          ← Projetos
        </Link>
        <h2 className="mt-2 text-2xl font-semibold">Novo projeto</h2>
      </div>
      {params.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] p-3 text-sm text-[var(--color-status-danger)]">
          <span aria-hidden="true">✕ </span>
          {params.error}
        </p>
      )}
      <form
        action={createProjectAction}
        className="space-y-4 rounded-lg border border-border bg-surface p-5"
      >
        <div>
          <Label htmlFor="code">Código</Label>
          <Input id="code" name="code" required placeholder="EX: OBRA-2026-01" />
        </div>
        <div>
          <Label htmlFor="name">Nome</Label>
          <Input id="name" name="name" required />
        </div>
        <div>
          <Label htmlFor="description">Descrição</Label>
          <TextArea id="description" name="description" rows={3} />
        </div>
        <Button type="submit">Criar projeto</Button>
      </form>
    </div>
  );
}
