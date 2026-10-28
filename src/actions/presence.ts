"use server";

import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

/** Heartbeat de presença na revisão (colaboração leve — Etapa D). */
export async function heartbeatPresenceAction(revisionId: string) {
  const session = await requireSession();
  if (!session.organizationId || !revisionId) {
    return { ok: false as const };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("revision_presence").upsert(
    {
      organization_id: session.organizationId,
      revision_id: revisionId,
      user_id: session.userId,
      last_seen_at: new Date().toISOString(),
      cursor_label: session.fullName,
    },
    { onConflict: "revision_id,user_id" },
  );

  if (error) return { ok: false as const, error: error.message };
  return { ok: true as const };
}

export async function listPresenceAction(revisionId: string) {
  const session = await requireSession();
  const supabase = await createClient();
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();

  const { data } = await supabase
    .from("revision_presence")
    .select("user_id, cursor_label, last_seen_at")
    .eq("revision_id", revisionId)
    .eq("organization_id", session.organizationId)
    .gte("last_seen_at", since);

  return (data || []).filter((p) => p.user_id !== session.userId);
}
