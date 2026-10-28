import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { isSupabaseConfigured } from "@/lib/env";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const params = await searchParams;
  const configured = isSupabaseConfigured();

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <header className="border-b border-divider bg-surface px-4 py-4">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <div className="flex h-10 min-w-[120px] items-center justify-center rounded-md border border-dashed border-divider bg-muted px-2 text-xs font-semibold text-ink-muted">
            Lunardeli Engenharia
          </div>
          <div>
            <p className="text-sm font-semibold">Lunardeli | Qualidade</p>
            <p className="text-[11px] text-ink-muted">
              Gestão e Qualidade de Projetos Estruturais
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center px-4 py-10">
        <div className="rounded-lg border border-border bg-surface p-6 shadow-[var(--shadow-sm)]">
          <h1 className="text-xl font-semibold text-ink">Entrar</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Ferramenta interna de produção e conferência de projetos
            estruturais.
          </p>

          {!configured && (
            <div className="mt-4 rounded-md border border-amber-200 bg-[var(--color-status-warn-bg)] p-3 text-sm text-[var(--color-status-warn)]">
              <strong>Supabase não configurado.</strong> Copie{" "}
              <code>.env.example</code> para <code>.env.local</code>, preencha
              as chaves e aplique as migrations em{" "}
              <code>supabase/migrations/</code>.
            </div>
          )}

          {params.error && (
            <div className="mt-4 rounded-md border border-red-200 bg-[var(--color-status-danger-bg)] p-3 text-sm text-[var(--color-status-danger)]">
              <span aria-hidden="true">✕ </span>
              {params.error}
            </div>
          )}

          <form action={loginAction} className="mt-6 space-y-4">
            <input type="hidden" name="next" value={params.next || "/dashboard"} />
            <div>
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="username"
                disabled={!configured}
              />
            </div>
            <div>
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                disabled={!configured}
              />
            </div>
            <Button type="submit" className="w-full" disabled={!configured}>
              Entrar
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
