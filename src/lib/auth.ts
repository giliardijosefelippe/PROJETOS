import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { MembershipRole, SessionContext } from "@/lib/types/domain";

export async function getSessionContext(): Promise<SessionContext | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("users_profiles")
    .select("full_name, email")
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, organizations(id, name)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!membership) {
    return {
      userId: user.id,
      email: profile?.email || user.email || "",
      fullName: profile?.full_name || user.email || "",
      organizationId: "",
      organizationName: "",
      role: "consulta",
    };
  }

  const org = membership.organizations as
    | { id: string; name: string }
    | { id: string; name: string }[]
    | null;
  const orgRow = Array.isArray(org) ? org[0] : org;

  return {
    userId: user.id,
    email: profile?.email || user.email || "",
    fullName: profile?.full_name || user.email || "",
    organizationId: membership.organization_id,
    organizationName: orgRow?.name || "",
    role: membership.role as MembershipRole,
  };
}

export async function requireSession(roles?: MembershipRole[]) {
  const ctx = await getSessionContext();
  if (!ctx?.userId) redirect("/login");
  if (!ctx.organizationId) redirect("/dashboard?sem_org=1");
  if (roles && !roles.includes(ctx.role)) {
    redirect("/dashboard?sem_permissao=1");
  }
  return ctx;
}

export function canManageTemplates(role: MembershipRole) {
  return role === "admin" || role === "coordenador";
}

export function canApprove(role: MembershipRole) {
  return role === "admin" || role === "coordenador" || role === "conferente";
}

export function canEditChecklist(role: MembershipRole) {
  return (
    role === "admin" ||
    role === "coordenador" ||
    role === "desenhista" ||
    role === "conferente"
  );
}
