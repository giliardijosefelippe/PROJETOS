import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { uploadPlantPdfAction } from "@/actions/mapas/drawings";
import { uploadPlantDxfAction } from "@/actions/mapas/dxf";
import { uploadPlantDwgAction } from "@/actions/mapas/dwg";
import { uploadIfcAction } from "@/actions/mapas/ifc";
import { createElementAction } from "@/actions/mapas/elements";
import { importElementsCsvAction } from "@/actions/mapas/import-elements";
import { cadConvertHealth } from "@/lib/cad/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, Select } from "@/components/ui/input";
import { compareVolumes } from "@/lib/mapas/geometry";

export default async function SiteDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ siteId: string }>;
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession();
  const { siteId } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const cadHealth = await cadConvertHealth();

  const { data: site } = await supabase
    .from("mc_sites")
    .select("*")
    .eq("id", siteId)
    .eq("organization_id", session.organizationId)
    .maybeSingle();
  if (!site) notFound();

  const { data: buildings } = await supabase
    .from("mc_buildings")
    .select("id, name, mc_floors(id, name)")
    .eq("site_id", siteId);

  const floors =
    buildings?.flatMap((b) => {
      const fl = b.mc_floors as
        | { id: string; name: string }[]
        | { id: string; name: string }
        | null;
      const list = Array.isArray(fl) ? fl : fl ? [fl] : [];
      return list.map((f) => ({ ...f, building: b.name }));
    }) || [];

  const { data: drawings } = await supabase
    .from("mc_drawing_revisions")
    .select(
      "id, revision_code, title, file_name, meters_per_pdf_unit, is_demo, created_at, source_kind, cad_unit_label",
    )
    .eq("site_id", siteId)
    .order("created_at", { ascending: false });

  const { data: elements } = await supabase
    .from("mc_structural_elements")
    .select(
      "id, code, name, kind, area_m2, thickness_m, volume_teorico_m3, is_demo",
    )
    .eq("site_id", siteId)
    .order("code");

  const { data: regions } = await supabase
    .from("mc_mapped_regions")
    .select("id, name, area_m2, drawing_revision_id")
    .eq("site_id", siteId);

  const { data: deliveries } = await supabase
    .from("mc_truck_deliveries")
    .select(
      "volume_nf_m3, volume_returned_m3, volume_other_dest_m3, mc_delivery_region_allocations(volume_allocated_m3)",
    )
    .eq("site_id", siteId);

  const volumeTeorico = (elements || []).reduce(
    (s, e) => s + Number(e.volume_teorico_m3 || 0),
    0,
  );
  const { data: intersections } = await supabase
    .from("mc_region_element_intersections")
    .select("volume_estimado_m3, region_id")
    .in(
      "region_id",
      (regions || []).map((r) => r.id).concat(["00000000-0000-0000-0000-000000000000"]),
    );

  const volumeEstimado = (intersections || []).reduce(
    (s, i) => s + Number(i.volume_estimado_m3 || 0),
    0,
  );
  const volumeNf = (deliveries || []).reduce(
    (s, d) => s + Number(d.volume_nf_m3 || 0),
    0,
  );
  const volumeAlocado = (deliveries || []).reduce((s, d) => {
    const a = d.mc_delivery_region_allocations as
      | { volume_allocated_m3: number }[]
      | null;
    const list = Array.isArray(a) ? a : [];
    return s + list.reduce((x, y) => x + Number(y.volume_allocated_m3 || 0), 0);
  }, 0);
  const volumeReturned = (deliveries || []).reduce(
    (s, d) => s + Number(d.volume_returned_m3 || 0),
    0,
  );
  const volumeOther = (deliveries || []).reduce(
    (s, d) => s + Number(d.volume_other_dest_m3 || 0),
    0,
  );
  const compare = compareVolumes({
    volumeTeoricoM3: volumeTeorico,
    volumeEstimadoMapeadoM3: volumeEstimado,
    volumeNfM3: volumeNf,
    volumeAlocadoM3: volumeAlocado,
    volumeDevolvidoM3: volumeReturned,
    volumeOutrosDestinosM3: volumeOther,
  });

  return (
    <div className="space-y-6">
      <div>
        <Link href="/mapas" className="text-sm text-ink-muted hover:underline">
          ← Obras
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <h2 className="text-2xl font-semibold">
            {site.code} — {site.name}
          </h2>
          {site.is_demo && <Badge>Demonstração</Badge>}
        </div>
        <p className="text-sm text-ink-muted">{site.description}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/mapas/${siteId}/concretagens`}>
            <Button variant="secondary" size="sm">
              Concretagens / NFs
            </Button>
          </Link>
          <Link href={`/mapas/${siteId}/rastreio`}>
            <Button variant="secondary" size="sm">
              Rastreio NF ↔ regiões
            </Button>
          </Link>
        </div>
      </div>

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

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Comparativo de volumes</h3>
        <p className="mt-1 text-xs text-ink-muted">
          {compare.labels.note} Diferenças não são rotuladas como desperdício.
        </p>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
          <div>
            <dt className="text-ink-muted">Teórico (elementos)</dt>
            <dd className="font-medium">{volumeTeorico.toFixed(3)} m³</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Estimado mapeado</dt>
            <dd className="font-medium">{volumeEstimado.toFixed(3)} m³</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Documentado em NFs</dt>
            <dd className="font-medium">{volumeNf.toFixed(3)} m³</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Alocado / lançado</dt>
            <dd className="font-medium">{volumeAlocado.toFixed(3)} m³</dd>
          </div>
          <div>
            <dt className="text-ink-muted">Devolvido + outros destinos</dt>
            <dd className="font-medium">
              {(volumeReturned + volumeOther).toFixed(3)} m³
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">{compare.labels.diferencaNfTeorico}</dt>
            <dd className="font-medium">
              {compare.diferencaNfTeorico.toFixed(3)} m³
              {compare.desvioPercentualNfTeorico != null
                ? ` (${compare.desvioPercentualNfTeorico.toFixed(1)}%)`
                : ""}
            </dd>
          </div>
        </dl>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <form
          action={importElementsCsvAction}
          className="space-y-3 rounded-lg border border-border bg-surface p-4 lg:col-span-2"
          encType="multipart/form-data"
        >
          <h3 className="font-semibold">Importar elementos (CSV)</h3>
          <p className="text-xs text-ink-muted">
            Quando o PDF não fornece geometria confiável, cadastre via planilha.
            Modelo:{" "}
            <a
              className="text-[var(--color-brand)] hover:underline"
              href="/api/mapas/elements-csv-template"
            >
              baixar template
            </a>
            .
          </p>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="floor_id" value={floors[0]?.id || ""} />
          <Input id="csv" name="file" type="file" accept=".csv,text/csv" required />
          <Button type="submit" variant="secondary">
            Importar CSV
          </Button>
        </form>

        <form
          action={uploadPlantDxfAction}
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
          encType="multipart/form-data"
        >
          <h3 className="font-semibold">Importar DXF</h3>
          <p className="text-xs text-ink-muted">
            Parser ASCII local. Não cria lajes/pilares automaticamente. Fixture:{" "}
            <code>fixtures/mapas/demo-laje-40m2.dxf</code>.
          </p>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="floor_id" value={floors[0]?.id || ""} />
          <div>
            <Label htmlFor="dxf_revision">Revisão</Label>
            <Input id="dxf_revision" name="revision_code" defaultValue="R00" />
          </div>
          <div>
            <Label htmlFor="dxf_title">Título</Label>
            <Input id="dxf_title" name="title" defaultValue="Planta DXF" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_demo" value="1" />
            Marcar como demonstração
          </label>
          <Input
            id="dxf_file"
            name="file"
            type="file"
            accept=".dxf,image/vnd.dxf,application/dxf"
            required
          />
          <Button type="submit">Enviar DXF</Button>
        </form>

        <form
          action={uploadPlantDwgAction}
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
          encType="multipart/form-data"
        >
          <h3 className="font-semibold">Importar DWG (Fase 3)</h3>
          <p className="text-xs text-ink-muted">
            Pipeline local: ODA File Converter (gratuito) → DXF intermediário →
            ezdxf.{" "}
            {cadHealth.dwg_supported
              ? "ODA detectado no serviço CAD."
              : "ODA não detectado — suba cad-convert com ODA no PATH ou envie DXF."}{" "}
            Sem SDK pago / sem leitura nativa de DWG.
          </p>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="floor_id" value={floors[0]?.id || ""} />
          <div>
            <Label htmlFor="dwg_revision">Revisão</Label>
            <Input id="dwg_revision" name="revision_code" defaultValue="R00" />
          </div>
          <div>
            <Label htmlFor="dwg_title">Título</Label>
            <Input id="dwg_title" name="title" defaultValue="Planta DWG" />
          </div>
          <Input
            id="dwg_file"
            name="file"
            type="file"
            accept=".dwg,image/vnd.dwg"
            required
          />
          <Button type="submit" disabled={!cadHealth.ok}>
            Enviar DWG
          </Button>
        </form>

        <form
          action={uploadIfcAction}
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
          encType="multipart/form-data"
        >
          <h3 className="font-semibold">Importar IFC (Fase 3)</h3>
          <p className="text-xs text-ink-muted">
            Preserva GUID, propriedades e Qto. Volumes só se vierem do arquivo.
            Sem viewer 3D neste incremento. Fixture:{" "}
            <code>fixtures/mapas/demo-laje-40m2.ifc</code>.
          </p>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="floor_id" value={floors[0]?.id || ""} />
          <input type="hidden" name="create_elements" value="1" />
          <div>
            <Label htmlFor="ifc_revision">Revisão</Label>
            <Input id="ifc_revision" name="revision_code" defaultValue="R00" />
          </div>
          <div>
            <Label htmlFor="ifc_title">Título</Label>
            <Input id="ifc_title" name="title" defaultValue="Modelo IFC" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="is_demo" value="1" />
            Marcar como demonstração
          </label>
          <Input
            id="ifc_file"
            name="file"
            type="file"
            accept=".ifc,.ifcxml,application/x-step"
            required
          />
          <Button type="submit">Enviar IFC</Button>
        </form>

        <form
          action={uploadPlantPdfAction}
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
          encType="multipart/form-data"
        >
          <h3 className="font-semibold">Importar PDF</h3>
          <input type="hidden" name="site_id" value={siteId} />
          <div>
            <Label htmlFor="floor_id">Pavimento</Label>
            <Select id="floor_id" name="floor_id" defaultValue={floors[0]?.id}>
              {floors.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.building} / {f.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label htmlFor="revision_code">Revisão</Label>
            <Input id="revision_code" name="revision_code" defaultValue="R00" />
          </div>
          <div>
            <Label htmlFor="title">Título</Label>
            <Input id="title" name="title" defaultValue="Planta de forma" />
          </div>
          <div>
            <Label htmlFor="file">Arquivo PDF</Label>
            <Input id="file" name="file" type="file" accept="application/pdf" required />
          </div>
          <Button type="submit">Enviar planta</Button>
        </form>

        <form
          action={createElementAction}
          className="space-y-3 rounded-lg border border-border bg-surface p-4"
        >
          <h3 className="font-semibold">Cadastrar elemento (laje)</h3>
          <input type="hidden" name="site_id" value={siteId} />
          <input type="hidden" name="floor_id" value={floors[0]?.id || ""} />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="code">Código</Label>
              <Input id="code" name="code" required placeholder="LJ-01" />
            </div>
            <div>
              <Label htmlFor="kind">Tipo</Label>
              <Select id="kind" name="kind" defaultValue="laje">
                <option value="laje">Laje</option>
                <option value="viga">Viga</option>
                <option value="pilar">Pilar</option>
                <option value="parede">Parede</option>
              </Select>
            </div>
          </div>
          <div>
            <Label htmlFor="name">Nome</Label>
            <Input id="name" name="name" required placeholder="Laje demo 40 m²" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label htmlFor="width_m">Largura (m)</Label>
              <Input id="width_m" name="width_m" type="number" step="0.01" defaultValue="8" />
            </div>
            <div>
              <Label htmlFor="depth_m">Profundidade (m)</Label>
              <Input id="depth_m" name="depth_m" type="number" step="0.01" defaultValue="5" />
            </div>
            <div>
              <Label htmlFor="thickness_m">Espessura (m)</Label>
              <Input
                id="thickness_m"
                name="thickness_m"
                type="number"
                step="0.01"
                defaultValue="0.15"
              />
            </div>
            <div>
              <Label htmlFor="height_m">Altura (m) — pilares</Label>
              <Input id="height_m" name="height_m" type="number" step="0.01" />
            </div>
            <div>
              <Label htmlFor="section_area_m2">Área seção (m²) — vigas</Label>
              <Input
                id="section_area_m2"
                name="section_area_m2"
                type="number"
                step="0.001"
              />
            </div>
            <div>
              <Label htmlFor="axis_length_m">Comp. eixo (m) — vigas</Label>
              <Input
                id="axis_length_m"
                name="axis_length_m"
                type="number"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="executed_length_m">Comp. executado (m)</Label>
              <Input
                id="executed_length_m"
                name="executed_length_m"
                type="number"
                step="0.01"
              />
            </div>
            <div>
              <Label htmlFor="origin_x">Origem X (m)</Label>
              <Input id="origin_x" name="origin_x" type="number" step="0.01" defaultValue="0" />
            </div>
            <div>
              <Label htmlFor="origin_y">Origem Y (m)</Label>
              <Input id="origin_y" name="origin_y" type="number" step="0.01" defaultValue="0" />
            </div>
          </div>
          <p className="text-xs text-ink-muted">
            Laje: 8×5×0,15. Pilar sem altura → indeterminado. Viga exige seção +
            comprimento executado (planta 2D não basta).
          </p>
          <Button type="submit">Salvar elemento</Button>
        </form>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Plantas / revisões</h3>
        <ul className="mt-2 divide-y divide-divider">
          {(drawings || []).length === 0 && (
            <li className="py-2 text-sm text-ink-muted">Nenhuma planta ainda.</li>
          )}
          {(drawings || []).map((d) => (
            <li key={d.id} className="flex items-center justify-between py-2 text-sm">
              <div>
                <Link
                  className="font-medium hover:text-[var(--color-brand)]"
                  href={`/mapas/${siteId}/planta/${d.id}`}
                >
                  {d.revision_code} — {d.title}
                </Link>
                <p className="text-ink-muted">
                  {d.file_name}
                  {d.source_kind === "dxf"
                    ? ` · DXF${d.cad_unit_label ? ` (${d.cad_unit_label})` : ""}`
                    : d.source_kind === "dwg"
                      ? " · DWG→DXF"
                      : d.source_kind === "ifc"
                        ? " · IFC"
                        : d.meters_per_pdf_unit
                          ? " · escala calibrada"
                          : " · escala pendente"}
                  {d.is_demo ? " · demonstração" : ""}
                </p>
              </div>
              <Link href={`/mapas/${siteId}/planta/${d.id}`}>
                <Button size="sm" variant="secondary">
                  Abrir visualizador
                </Button>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-lg border border-border bg-surface p-4">
        <h3 className="font-semibold">Elementos</h3>
        <ul className="mt-2 text-sm">
          {(elements || []).map((e) => (
            <li key={e.id} className="border-b border-divider py-2">
              <span className="font-medium">
                {e.code} {e.name}
              </span>{" "}
              <span className="text-ink-muted">
                [{e.kind}] área {e.area_m2 ?? "—"} m² · esp. {e.thickness_m ?? "—"} m
                · teórico {e.volume_teorico_m3 ?? "—"} m³
                {e.is_demo ? " · demo" : ""}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
