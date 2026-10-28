import { createClient } from "@/lib/supabase/server";

export type AuditInput = {
  organizationId: string | null;
  actorId: string | null;
  action: string;
  entityType?: string;
  entityId?: string | null;
  payload?: Record<string, unknown>;
};

/** Append-only audit. Failures are logged but do not break the main flow. */
export async function writeAudit(input: AuditInput) {
  try {
    const supabase = await createClient();
    const { error } = await supabase.from("audit_events").insert({
      organization_id: input.organizationId,
      actor_id: input.actorId,
      action: input.action,
      entity_type: input.entityType || null,
      entity_id: input.entityId || null,
      payload: input.payload || {},
    });
    if (error) {
      console.error("[audit]", error.message, input.action);
    }
  } catch (err) {
    console.error("[audit] unexpected", err);
  }
}
