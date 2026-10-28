import Link from "next/link";
import Image from "next/image";
import type { SessionContext } from "@/lib/types/domain";
import { ROLE_LABELS } from "@/lib/types/domain";
import { logoutAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

const NAV = [
  { href: "/dashboard", label: "Painel" },
  { href: "/projects", label: "Projetos" },
  { href: "/templates", label: "Templates" },
  { href: "/issues", label: "Pendências" },
  { href: "/indicators", label: "Indicadores" },
  { href: "/reports", label: "Relatórios" },
  { href: "/admin/members", label: "Equipe" },
  { href: "/admin/branding", label: "Marca" },
];

export function AppShell({
  session,
  logoUrl,
  children,
}: {
  session: SessionContext;
  logoUrl?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-muted text-ink">
      <header className="border-b border-divider bg-surface">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <Link href="/dashboard" className="flex items-center gap-3">
              {logoUrl ? (
                <Image
                  src={logoUrl}
                  alt="Lunardeli Engenharia"
                  width={140}
                  height={40}
                  className="h-10 w-auto object-contain"
                  unoptimized
                />
              ) : (
                <div
                  className="flex h-10 min-w-[140px] items-center justify-center rounded-md border border-dashed border-divider bg-muted px-3 text-xs font-semibold text-ink-muted"
                  title="Substitua o logotipo em Equipe/Marca quando o arquivo da marca estiver disponível"
                >
                  Lunardeli Engenharia
                </div>
              )}
              <div className="hidden sm:block">
                <p className="text-sm font-semibold tracking-tight text-ink">
                  Lunardeli | Qualidade
                </p>
                <p className="max-w-xs text-[11px] leading-snug text-ink-muted">
                  Gestão e Qualidade de Projetos Estruturais
                </p>
              </div>
            </Link>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <div className="text-right">
              <p className="font-medium text-ink">{session.fullName}</p>
              <p className="text-ink-muted">
                {ROLE_LABELS[session.role]}
                {session.organizationName
                  ? ` · ${session.organizationName}`
                  : ""}
              </p>
            </div>
            <form action={logoutAction}>
              <Button type="submit" variant="secondary" size="sm">
                Sair
              </Button>
            </form>
          </div>
        </div>
        <nav
          className="mx-auto flex max-w-7xl gap-0.5 overflow-x-auto border-t border-divider px-4 py-1.5"
          aria-label="Principal"
        >
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="rounded-md px-3 py-1.5 text-sm text-ink-muted hover:bg-muted hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
