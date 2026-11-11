import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createDrawingRevisionCopyAction } from "@/actions/mapas/drawings";
import { createElementAction } from "@/actions/mapas/elements";
import { PlantViewer } from "@/components/mapas/plant-viewer";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  detectRegionOverlaps,
  polygonFromGeoJson,
  type GeoJsonPolygon,
} from "@/lib/mapas/geometry";

const BUCKET = process.env.STORAGE_BUCKET_LIBRARY || "library";

export default async function PlantaPage({
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

  const { data: drawing } = await supabase
    .from("mc_drawing_revisions")
    .select("*")
    .eq("id", drawingId)
    .eq("site_id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!drawing) notFound();

  const { data: signed } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(drawing.storage_path, 60 * 30);

  const { data: regions } = await supabase
    .from("mc_mapped_regions")
    .select("id, name, tool, color, area_m2, geometry")
    .eq("drawing_revision_id", drawingId)
    .order("created_at");

  const { data: intersections } = await supabase
    .from("mc_region_element_intersections")
    .select(
      "region_id, percent, volume_estimado_m3, indeterminate, warnings, method, mc_structural_elements(code, name, kind)",
    )
    .in(
      "region_id",
      (regions || []).map((r) => r.id).concat(["00000000-0000-0000-0000-000000000000"]),
    );

  const regionName = new Map((regions || []).map((r) => [r.id, r.name]));
  const overlaps = detectRegionOverlaps(
    (regions || [])
      .map((r) => {
        const poly = polygonFromGeoJson(r.geometry as GeoJsonPolygon);
        return poly ? { id: r.id, polygon: poly } : null;
      })
      .filter(Boolean) as Array<{
      id: string;
      polygon: NonNullable<ReturnType<typeof polygonFromGeoJson>>;
    }>,
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href={`/mapas/${siteId}`}
            className="text-sm text-ink-muted hover:underline"
          >
            ← Obra
          </Link>
          <h2 className="mt-1 text-2xl font-semibold">
            {drawing.revision_code} — {drawing.title}
          </h2>
          <p className="text-sm text-ink-muted">
            {drawing.file_name} · hash {drawing.content_hash.slice(0, 12)}…
            {drawing.is_demo ? " · " : ""}
            {drawing.is_demo && <Badge>Demonstração</Badge>}
          </p>
        </div>
        <form action={createDrawingRevisionCopyAction} className="flex items-end gap-2">
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="drawing_id" value={drawingId} />
          <div>
            <Label htmlFor="revision_code">Nova revisão</Label>
            <Input
              id="revision_code"
              name="revision_code"
              placeholder="R01"
              className="w-24"
              required
            />
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Criar revisão
          </Button>
        </form>
      </div>

      <p className="text-xs text-ink-muted">
        Nova revisão reutiliza o arquivo imutável e{" "}
        <strong>não move</strong> mapeamentos da revisão anterior.
      </p>

      {sp.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] px-3 py-2 text-sm text-[var(--color-status-danger)]">
          {sp.error}
        </p>
      )}
      {sp.ok && (
        <p className="rounded-md bg-[var(--color-status-ok-bg)] px-3 py-2 text-sm text-[var(--color-status-ok)]">
          Salvo ({sp.ok}).
        </p>
      )}

      {!signed?.signedUrl ? (
        <p className="text-sm text-[var(--color-status-danger)]">
          Não foi possível assinar a URL do PDF. Verifique Storage/bucket{" "}
          <code>{BUCKET}</code>.
        </p>
      ) : (
        <PlantViewer
          siteId={siteId}
          drawingId={drawingId}
          pdfUrl={signed.signedUrl}
          metersPerPdfUnit={
            drawing.meters_per_pdf_unit != null
              ? Number(drawing.meters_per_pdf_unit)
              : null
          }
          scaleP1={drawing.scale_p1 as number[] | null}
          scaleP2={drawing.scale_p2 as number[] | null}
          scaleRealM={
            drawing.scale_real_m != null ? Number(drawing.scale_real_m) : null
          }
          selectedPage={drawing.selected_page || 1}
          regions={(regions || []).map((r) => ({
            id: r.id,
            name: r.name,
            tool: r.tool,
            color: r.color,
            area_m2: r.area_m2 != null ? Number(r.area_m2) : null,
            geometry: r.geometry as {
              type: string;
              coordinates: number[][][];
            },
          }))}
        />
      )}

      {overlaps.length > 0 && (
        <p className="rounded-md border border-[var(--color-status-warn)] bg-[var(--color-status-warn-bg)] px-3 py-2 text-sm text-[var(--color-status-warn)]">
          Sobreposição detectada entre regiões (
          {overlaps
            .map(
              (o) =>
                `${regionName.get(o.aId) || o.aId} ∩ ${regionName.get(o.bId) || o.bId}: ${o.overlapAreaM2.toFixed(3)} m²`,
            )
            .join("; ")}
          ). Percentuais acumulados usam <strong>união</strong> — sem soma
          duplicada por padrão.
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border bg-surface p-4">
          <h3 className="font-semibold">Regiões nesta revisão</h3>
          <ul className="mt-2 space-y-2 text-sm">
            {(regions || []).map((r) => (
              <li key={r.id}>
                <span className="font-medium">{r.name}</span>{" "}
                <span className="text-ink-muted">
                  ({r.tool}) · {r.area_m2 != null ? Number(r.area_m2).toFixed(3) : "—"}{" "}
                  m²
                </span>
              </li>
            ))}
            {(regions || []).length === 0 && (
              <li className="text-ink-muted">Nenhuma região salva.</li>
            )}
          </ul>
          <h4 className="mt-4 font-medium">Interseções / quantitativos</h4>
          <ul className="mt-1 space-y-1 text-sm">
            {(intersections || []).map((i, idx) => {
              const el = i.mc_structural_elements as
                | { code: string; name: string; kind: string }
                | { code: string; name: string; kind: string }[]
                | null;
              const row = Array.isArray(el) ? el[0] : el;
              return (
                <li key={idx}>
                  {row?.code} {row?.name}:{" "}
                  {i.indeterminate
                    ? "volume indeterminado"
                    : `${i.percent != null ? Number(i.percent).toFixed(1) + "%" : "—"} · ${i.volume_estimado_m3 != null ? Number(i.volume_estimado_m3).toFixed(3) + " m³" : "—"}`}
                  <span className="text-ink-muted"> · {i.method}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <form
          action={createElementAction}
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
        >
          <h3 className="font-semibold">Laje rápida (aceite 40 m²)</h3>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="drawing_id" value={drawingId} />
          <input type="hidden" name="floor_id" value={drawing.floor_id || ""} />
          <input type="hidden" name="kind" value="laje" />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="code">Código</Label>
              <Input id="code" name="code" defaultValue="LJ-40" required />
            </div>
            <div>
              <Label htmlFor="name">Nome</Label>
              <Input id="name" name="name" defaultValue="Laje 40 m²" required />
            </div>
            <div>
              <Label htmlFor="width_m">Largura</Label>
              <Input id="width_m" name="width_m" type="number" step="0.01" defaultValue="8" />
            </div>
            <div>
              <Label htmlFor="depth_m">Profundidade</Label>
              <Input id="depth_m" name="depth_m" type="number" step="0.01" defaultValue="5" />
            </div>
            <div>
              <Label htmlFor="thickness_m">Espessura</Label>
              <Input
                id="thickness_m"
                name="thickness_m"
                type="number"
                step="0.01"
                defaultValue="0.15"
              />
            </div>
          </div>
          <Button type="submit">Cadastrar laje</Button>
        </form>
      </div>
    </div>
  );
}
