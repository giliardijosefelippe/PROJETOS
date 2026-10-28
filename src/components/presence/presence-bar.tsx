"use client";

import { useEffect, useState, useTransition } from "react";
import {
  heartbeatPresenceAction,
  listPresenceAction,
} from "@/actions/presence";

type Peer = {
  user_id: string;
  cursor_label: string | null;
  last_seen_at: string;
};

export function PresenceBar({ revisionId }: { revisionId: string }) {
  const [peers, setPeers] = useState<Peer[]>([]);
  const [, start] = useTransition();

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      start(async () => {
        await heartbeatPresenceAction(revisionId);
        const list = await listPresenceAction(revisionId);
        if (!cancelled) setPeers(list as Peer[]);
      });
    }
    tick();
    const id = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [revisionId]);

  return (
    <div className="rounded-md border border-border bg-surface px-3 py-2 text-sm">
      <span className="font-medium text-ink">Colaboração (presença): </span>
      {peers.length === 0 ? (
        <span className="text-ink-muted">
          Só você nesta revisão agora (ou tabela `revision_presence` ainda não
          migrada).
        </span>
      ) : (
        <span className="text-ink-muted">
          {peers.map((p) => p.cursor_label || p.user_id.slice(0, 8)).join(", ")}{" "}
          online
        </span>
      )}
      <p className="mt-1 text-xs text-ink-muted">
        MVP de presença — sem locks de edição. Revisão colaborativa avançada =
        Etapa D futura.
      </p>
    </div>
  );
}
