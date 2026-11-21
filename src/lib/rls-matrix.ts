import type { MembershipRole } from "@/lib/types/domain";

/** Matriz esperada de permissões (espelha policies em 00002_rls.sql) — testável offline */

export type Resource =
  | "projects_write"
  | "templates_write"
  | "drawings_write"
  | "runs_write"
  | "approvals_insert"
  | "memberships_admin"
  | "consulta_read"
  | "branding_logo"
  | "mapas_write"
  | "mapas_pour_status"
  | "mapas_field"
  | "mapas_audit_read";

const MATRIX: Record<Resource, MembershipRole[]> = {
  projects_write: ["admin", "coordenador"],
  templates_write: ["admin", "coordenador"],
  drawings_write: ["admin", "coordenador", "desenhista"],
  runs_write: ["admin", "coordenador", "desenhista", "conferente"],
  approvals_insert: ["admin", "coordenador", "conferente"],
  memberships_admin: ["admin"],
  consulta_read: ["admin", "coordenador", "desenhista", "conferente", "consulta"],
  branding_logo: ["admin"],
  mapas_write: ["admin", "coordenador", "desenhista"],
  mapas_pour_status: ["admin", "coordenador", "conferente"],
  mapas_field: ["admin", "coordenador", "desenhista", "conferente"],
  mapas_audit_read: ["admin", "coordenador", "conferente"],
};

export function roleCan(role: MembershipRole, resource: Resource) {
  return MATRIX[resource].includes(role);
}

/** Isolamento: linhas só da org com membership active */
export function canSeeOrgRow(opts: {
  userId: string;
  rowOrgId: string;
  memberships: Array<{
    user_id: string;
    organization_id: string;
    status: string;
  }>;
}) {
  return opts.memberships.some(
    (m) =>
      m.user_id === opts.userId &&
      m.organization_id === opts.rowOrgId &&
      m.status === "active",
  );
}
