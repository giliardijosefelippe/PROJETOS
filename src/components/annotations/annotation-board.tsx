"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label, TextArea } from "@/components/ui/input";
import { createAnnotationAction } from "@/actions/annotations";

type Annotation = {
  id: string;
  x: number;
  y: number;
  label: string;
  note: string | null;
  color: string;
  page_number: number;
};

export function AnnotationBoard({
  revisionId,
  annotations,
  immutable,
}: {
  revisionId: string;
  annotations: Annotation[];
  immutable: boolean;
}) {
  const [pending, setPending] = useState<{ x: number; y: number } | null>(
    null,
  );

  function onClick(e: React.MouseEvent<HTMLDivElement>) {
    if (immutable) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    setPending({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
  }

  return (
    <div className="space-y-4">
      <div
        role="application"
        aria-label="Área de marcação da prancha"
        onClick={onClick}
        className="relative aspect-[4/3] w-full cursor-crosshair overflow-hidden rounded-lg border border-border bg-[linear-gradient(45deg,#f5f5f5_25%,transparent_25%),linear-gradient(-45deg,#f5f5f5_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f5f5f5_75%),linear-gradient(-45deg,transparent_75%,#f5f5f5_75%)] bg-[length:20px_20px] bg-[position:0_0,0_10px,10px_-10px,-10px_0] bg-surface"
      >
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <p className="max-w-sm rounded bg-surface/90 px-3 py-2 text-center text-xs text-ink-muted shadow-sm">
            Clique para marcar (coordenadas normalizadas 0–1).
            Substitua este plano por visualização PDF.js / arquivo da revisão
            quando o storage estiver configurado. DWG/IFC: ver stubs de
            integração.
          </p>
        </div>
        {annotations.map((a) => (
          <div
            key={a.id}
            title={`${a.label}${a.note ? ` — ${a.note}` : ""}`}
            className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
            style={{
              left: `${a.x * 100}%`,
              top: `${a.y * 100}%`,
            }}
          >
            <span
              className="flex h-6 min-w-6 items-center justify-center rounded-full border-2 border-white px-1 text-[10px] font-bold text-white shadow"
              style={{ background: a.color || "var(--color-brand)" }}
            >
              •
            </span>
          </div>
        ))}
        {pending && (
          <div
            className="absolute z-20 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--color-brand)] ring-2 ring-white"
            style={{
              left: `${pending.x * 100}%`,
              top: `${pending.y * 100}%`,
            }}
          />
        )}
      </div>

      {pending && !immutable && (
        <form
          action={createAnnotationAction}
          className="space-y-2 rounded-lg border border-border bg-surface p-4"
        >
          <input type="hidden" name="revision_id" value={revisionId} />
          <input type="hidden" name="page_number" value={1} />
          <input type="hidden" name="x" value={pending.x} />
          <input type="hidden" name="y" value={pending.y} />
          <p className="text-sm text-ink-muted">
            Posição: x={pending.x}, y={pending.y}
          </p>
          <div>
            <Label htmlFor="label">Rótulo</Label>
            <Input id="label" name="label" required defaultValue="Pendência" />
          </div>
          <div>
            <Label htmlFor="note">Nota</Label>
            <TextArea id="note" name="note" rows={2} />
          </div>
          <div className="flex gap-2">
            <Button type="submit">Salvar marcação</Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setPending(null)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
