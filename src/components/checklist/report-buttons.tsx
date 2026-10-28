"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

const TYPES = [
  { id: "producao", label: "Produção" },
  { id: "conferencia", label: "Conferência" },
  { id: "pendencias", label: "Pendências" },
  { id: "resumo", label: "Resumo" },
] as const;

export function ReportButtons({ revisionId }: { revisionId: string }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(reportType: string) {
    setBusy(reportType);
    setError(null);
    try {
      const res = await fetch("/api/reports/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId, reportType }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Erro ${res.status}`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `relatorio-${reportType}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Falha ao gerar PDF");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      <div className="flex flex-wrap gap-2">
        {TYPES.map((t) => (
          <Button
            key={t.id}
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy !== null}
            onClick={() => generate(t.id)}
          >
            {busy === t.id ? "Gerando…" : t.label}
          </Button>
        ))}
      </div>
      {error && (
        <p className="text-sm text-[var(--color-status-danger)]">
          <span aria-hidden="true">✕ </span>
          {error}
        </p>
      )}
    </div>
  );
}
