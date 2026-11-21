import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  reconcileArchiveAction,
  reconcileCopyToTargetAction,
  reconcileReassociateAction,
} from "@/actions/mapas/reconcile";
import {
  compareRevisionRegions,
  type ReconcileStatus,
} from "@/lib/mapas/revision-reconcile";
import type { GeoJsonPolygon } from "@/lib/mapas/geometry";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";

const STATUS_LABEL: Record<ReconcileStatus, string> = {
  orphan_on_source: "Órfã (origem)",
  matched_geometry: "Geometria equivalente",
  displaced_candidate: "Possível deslocamento",
  already_on_target: "Só na revisão nova",
  no_geometry: "Sem geometria",
};

export default async function ReconciliarRevisaoPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string; drawingId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession();
  const { siteId, drawingId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("mc_drawing_revisions")
    .select("id, revision_code, title, supersedes_revision_id, site_id")
    .eq("id", drawingId)
    .eq("site_id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!target) notFound();

  if (!target.supersedes_revision_id) {
    return (
      <div className="space-y-3">
        <Link
          href={`/mapas/${siteId}/planta/${drawingId}`}
          className="text-sm text-ink-muted hover:underline"
        >
          ← Planta
        </Link>
        <h2 className="text-2xl font-semibold">Reconciliação assistida</h2>
        <p className="text-sm text-ink-muted">
          Esta revisão não tem revisão origem vinculada. Crie uma nova revisão
          a partir de uma planta existente para reconciliar mapeamentos.
        </p>
      </div>
    );
  }

  const { data: source } = await supabase
    .from("mc_drawing_revisions")
    .select("id, revision_code, title")
    .eq("id", target.supersedes_revision_id)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!source) notFound();

  const { data: sourceRegions } = await supabase
    .from("mc_mapped_regions")
    .select(
      "id, name, geometry, area_m2, tool, archived_at, drawing_revision_id",
    )
    .eq("drawing_revision_id", source.id)
    .order("created_at");

  const { data: targetRegions } = await supabase
    .from("mc_mapped_regions")
    .select(
      "id, name, geometry, area_m2, tool, archived_at, drawing_revision_id, copied_from_region_id",
    )
    .eq("drawing_revision_id", target.id)
    .order("created_at");

  const { data: decisions } = await supabase
    .from("mc_region_reconciliations")
    .select(
      "id, decision, source_region_id, target_region_id, notes, created_at, proposal_status",
    )
    .eq("source_revision_id", source.id)
    .eq("target_revision_id", target.id)
    .order("created_at", { ascending: false })
    .limit(50);

  const decidedSourceIds = new Set(
    (decisions || [])
      .filter((d) => d.source_region_id)
      .map((d) => d.source_region_id as string),
  );

  const report = compareRevisionRegions({
    sourceRevisionId: source.id,
    targetRevisionId: target.id,
    sourceRegions: (sourceRegions || []).map((r) => ({
      id: r.id,
      name: r.name,
      drawingRevisionId: r.drawing_revision_id,
      geometry: r.geometry as GeoJsonPolygon,
      areaM2: r.area_m2 != null ? Number(r.area_m2) : null,
      tool: r.tool,
      archivedAt: r.archived_at,
    })),
    targetRegions: (targetRegions || []).map((r) => ({
      id: r.id,
      name: r.name,
      drawingRevisionId: r.drawing_revision_id,
      geometry: r.geometry as GeoJsonPolygon,
      areaM2: r.area_m2 != null ? Number(r.area_m2) : null,
      tool: r.tool,
      archivedAt: r.archived_at,
    })),
  });

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/mapas/${siteId}/planta/${drawingId}`}
          className="text-sm text-ink-muted hover:underline"
        >
          ← {target.revision_code}
        </Link>
        <h2 className="mt-1 text-2xl font-semibold">
          Reconciliação assistida
        </h2>
        <p className="text-sm text-ink-muted">
          Origem{" "}
          <Link
            href={`/mapas/${siteId}/planta/${source.id}`}
            className="underline"
          >
            {source.revision_code}
          </Link>{" "}
          → alvo {target.revision_code}. Mapeamentos da origem{" "}
          <strong>não</strong> são reposicionados automaticamente.
        </p>
      </div>

      {sp.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] px-3 py-2 text-sm text-[var(--color-status-danger)]">
          {sp.error}
        </p>
      )}
      {sp.ok && (
        <p className="rounded-md bg-[var(--color-status-ok-bg)] px-3 py-2 text-sm text-[var(--color-status-ok)]">
          Decisão registrada ({sp.ok}).
        </p>
      )}

      <div className="flex flex-wrap gap-2 text-sm">
        <Badge>Órfãs: {report.summary.orphan}</Badge>
        <Badge>Equivalentes: {report.summary.matched}</Badge>
        <Badge>Deslocadas: {report.summary.displaced}</Badge>
        <Badge>Só na nova: {report.summary.alreadyOnTarget}</Badge>
      </div>

      <ul className="text-xs text-ink-muted space-y-1">
        {report.notes.map((n) => (
          <li key={n}>• {n}</li>
        ))}
      </ul>

      <div className="space-y-3">
        {report.proposals.map((p, idx) => {
          const alreadyDecided =
            p.sourceRegionId && decidedSourceIds.has(p.sourceRegionId);
          return (
            <section
              key={`${p.sourceRegionId}-${p.targetRegionId}-${idx}`}
              className="rounded-lg border border-border bg-surface p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-medium">
                    {p.sourceName}
                    {p.targetName ? ` → ${p.targetName}` : ""}
                  </p>
                  <p className="text-sm text-ink-muted">{p.message}</p>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs">
                    <Badge>{STATUS_LABEL[p.status]}</Badge>
                    {p.overlapRatio != null && (
                      <span className="text-ink-muted">
                        sobreposição {(p.overlapRatio * 100).toFixed(1)}%
                      </span>
                    )}
                    {p.centroidShiftM != null &&
                      Number.isFinite(p.centroidShiftM) && (
                        <span className="text-ink-muted">
                          Δ centroide {p.centroidShiftM.toFixed(2)} m
                        </span>
                      )}
                    {alreadyDecided && (
                      <Badge>Decisão já registrada</Badge>
                    )}
                  </div>
                </div>
              </div>

              {p.status !== "already_on_target" && p.sourceRegionId && (
                <div className="mt-3 flex flex-wrap items-end gap-3">
                  {(p.suggestedAction === "copy_to_target" ||
                    p.suggestedAction === "review") && (
                    <form
                      action={reconcileCopyToTargetAction}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input type="hidden" name="site_id" value={siteId} />
                      <input
                        type="hidden"
                        name="target_revision_id"
                        value={target.id}
                      />
                      <input
                        type="hidden"
                        name="source_region_id"
                        value={p.sourceRegionId}
                      />
                      <input
                        type="hidden"
                        name="proposal_status"
                        value={p.status}
                      />
                      <div>
                        <Label htmlFor={`notes-copy-${idx}`}>Nota</Label>
                        <Input
                          id={`notes-copy-${idx}`}
                          name="notes"
                          placeholder="Aceitar cópia explícita"
                          className="w-48"
                        />
                      </div>
                      <Button type="submit" size="sm">
                        Aceitar (copiar)
                      </Button>
                    </form>
                  )}

                  {(p.suggestedAction === "reassociate" ||
                    p.suggestedAction === "review") &&
                    p.targetRegionId && (
                      <form
                        action={reconcileReassociateAction}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="site_id" value={siteId} />
                        <input
                          type="hidden"
                          name="target_revision_id"
                          value={target.id}
                        />
                        <input
                          type="hidden"
                          name="source_region_id"
                          value={p.sourceRegionId}
                        />
                        <input
                          type="hidden"
                          name="target_region_id"
                          value={p.targetRegionId}
                        />
                        <input
                          type="hidden"
                          name="proposal_status"
                          value={p.status}
                        />
                        <div>
                          <Label htmlFor={`notes-re-${idx}`}>Nota</Label>
                          <Input
                            id={`notes-re-${idx}`}
                            name="notes"
                            placeholder="Reassociar"
                            className="w-40"
                          />
                        </div>
                        <Button type="submit" size="sm" variant="secondary">
                          Reassociar
                        </Button>
                      </form>
                    )}

                  <form
                    action={reconcileArchiveAction}
                    className="flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="site_id" value={siteId} />
                    <input
                      type="hidden"
                      name="target_revision_id"
                      value={target.id}
                    />
                    <input
                      type="hidden"
                      name="source_region_id"
                      value={p.sourceRegionId}
                    />
                    <input
                      type="hidden"
                      name="proposal_status"
                      value={p.status}
                    />
                    <div>
                      <Label htmlFor={`notes-arch-${idx}`}>Motivo</Label>
                      <Input
                        id={`notes-arch-${idx}`}
                        name="notes"
                        placeholder="Arquivar"
                        className="w-40"
                      />
                    </div>
                    <Button type="submit" size="sm" variant="ghost">
                      Arquivar
                    </Button>
                  </form>
                </div>
              )}
            </section>
          );
        })}
        {report.proposals.length === 0 && (
          <p className="text-sm text-ink-muted">
            Nenhuma região para reconciliar entre estas revisões.
          </p>
        )}
      </div>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Auditoria desta reconciliação</h3>
        <ul className="mt-2 space-y-1 text-sm">
          {(decisions || []).map((d) => (
            <li key={d.id} className="text-ink-muted">
              <span className="font-medium text-ink">{d.decision}</span>
              {d.proposal_status ? ` · ${d.proposal_status}` : ""}
              {d.notes ? ` — ${d.notes}` : ""}
              {" · "}
              {new Date(d.created_at).toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              })}
            </li>
          ))}
          {(decisions || []).length === 0 && (
            <li className="text-ink-muted">Nenhuma decisão ainda.</li>
          )}
        </ul>
      </section>
    </div>
  );
}
