import Link from "next/link";

const LINKS = [
  { href: "", label: "Obra" },
  { href: "/painel", label: "Painel" },
  { href: "/concretagens", label: "Concretagens" },
  { href: "/rastreio", label: "Rastreio" },
  { href: "/campo", label: "Campo" },
  { href: "/auditoria", label: "Auditoria" },
  { href: "/notificacoes", label: "Avisos" },
  { href: "/relatorios", label: "Relatórios" },
] as const;

export function SiteNav({
  siteId,
  current,
}: {
  siteId: string;
  current?: string;
}) {
  return (
    <nav className="flex flex-wrap gap-2 text-sm">
      {LINKS.map((l) => {
        const path = `/mapas/${siteId}${l.href}`;
        const active =
          current === l.href ||
          (current === undefined && l.href === "") ||
          (current === l.href);
        return (
          <Link
            key={l.href || "home"}
            href={path}
            className={
              active
                ? "rounded-md bg-[var(--color-muted)] px-2 py-1 font-medium text-ink"
                : "rounded-md px-2 py-1 text-ink-muted hover:bg-[var(--color-muted)] hover:text-ink"
            }
          >
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
