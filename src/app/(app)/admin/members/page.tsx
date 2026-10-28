import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ROLE_LABELS, type MembershipRole } from "@/lib/types/domain";
import { StatusChip } from "@/components/ui/status-chip";

export default async function MembersPage() {
  const session = await requireSession();
  const supabase = await createClient();

  const { data: members } = await supabase
    .from("organization_memberships")
    .select("id, role, status, users_profiles(full_name, email)")
    .eq("organization_id", session.organizationId)
    .order("created_at");

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Equipe</h2>
        <p className="text-sm text-ink-muted">
          Membros da organização e papéis. Convites adicionais: via Supabase Auth
          + membership (seed ou painel admin).
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-divider bg-muted text-ink-muted">
            <tr>
              <th className="px-4 py-2">Nome</th>
              <th className="px-4 py-2">E-mail</th>
              <th className="px-4 py-2">Papel</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-divider">
            {(members || []).map((m) => {
              const p = m.users_profiles as
                | { full_name: string; email: string }
                | { full_name: string; email: string }[]
                | null;
              const row = Array.isArray(p) ? p[0] : p;
              return (
                <tr key={m.id}>
                  <td className="px-4 py-3">{row?.full_name || "—"}</td>
                  <td className="px-4 py-3">{row?.email}</td>
                  <td className="px-4 py-3">
                    {ROLE_LABELS[m.role as MembershipRole]}
                  </td>
                  <td className="px-4 py-3">
                    <StatusChip
                      label={m.status}
                      tone={m.status === "active" ? "ok" : "neutral"}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
