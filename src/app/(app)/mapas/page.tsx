import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function MapasPage() {
  const session = await requireSession();
  const supabase = await createClient();
  const { data: sites } = await supabase
    .from("mc_sites")
    .select("id, code, name, description, is_demo, created_at")
    .eq("organization_id", session.organizationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold">MapaConcreto</h2>
          <p className="text-sm text-ink-muted">
            Obras, plantas PDF, regiões mapeadas, concretagens e rastreabilidade
            de volumes (teórico ≠ NF ≠ desperdício).
          </p>
        </div>
        <Link href="/mapas/nova">
          <Button>Nova obra</Button>
        </Link>
      </div>

      <ul className="divide-y divide-divider rounded-lg border border-border bg-surface">
        {(sites || []).length === 0 && (
          <li className="p-4 text-sm text-ink-muted">
            Nenhuma obra cadastrada. Crie uma obra ou rode{" "}
            <code className="text-xs">npm run seed:mapas</code> (dados de
            demonstração).
          </li>
        )}
        {(sites || []).map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <Link
                  href={`/mapas/${s.id}`}
                  className="font-medium text-ink hover:text-[var(--color-brand)]"
                >
                  {s.code} — {s.name}
                </Link>
                {s.is_demo && <Badge>Demonstração</Badge>}
              </div>
              {s.description && (
                <p className="text-sm text-ink-muted">{s.description}</p>
              )}
            </div>
            <Link href={`/mapas/${s.id}`}>
              <Button variant="secondary" size="sm">
                Abrir
              </Button>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
