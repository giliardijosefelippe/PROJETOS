#!/usr/bin/env node
/**
 * Seed MapaConcreto — dados de DEMONSTRAÇÃO
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Prefer running after npm run seed (org + users) and migration 00007.
 *
 * Usage: npm run seed:mapas
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import PDFDocument from "pdfkit";

function loadEnv() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim().replace(/^["']|["']$/g, "");
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key || url.includes("YOUR_PROJECT")) {
  console.error(
    "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.",
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKET = process.env.STORAGE_BUCKET_LIBRARY || "library";

function buildDemoPdf() {
  return new Promise((resolvePdf, reject) => {
    const doc = new PDFDocument({ size: [600, 400], margin: 40 });
    const chunks = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolvePdf(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.fontSize(18).fillColor("#E00024").text("DEMONSTRAÇÃO — MapaConcreto");
    doc.moveDown();
    doc
      .fontSize(11)
      .fillColor("#222")
      .text(
        "Planta fictícia para calibração e mapeamento. Não é documento de obra real.",
      );
    doc.rect(80, 120, 320, 200).stroke("#222");
    doc.fontSize(10).text("Laje demo 8,00 × 5,00 m (40 m²)", 90, 130);
    doc.text("Cota de referência: 5,00 m (lado menor)", 90, 150);
    // Visual scale bar ~200 pdf units = 5 m after calibration tip
    doc.moveTo(90, 300).lineTo(290, 300).stroke("#175cd3");
    doc.fillColor("#175cd3").text("barra 5,00 m (calibrar estes extremos)", 90, 305);
    doc.end();
  });
}

async function main() {
  const { data: orgs } = await admin
    .from("organizations")
    .select("id, name")
    .limit(1);
  const org = orgs?.[0];
  if (!org) {
    console.error("Nenhuma organização. Rode npm run seed antes.");
    process.exit(1);
  }

  const { data: membership } = await admin
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", org.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  const userId = membership?.user_id || null;

  const pdf = await buildDemoPdf();
  const hash = createHash("sha256").update(pdf).digest("hex");
  const outDir = resolve(process.cwd(), "public/demo");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, "mapaconcreto-demo.pdf"), pdf);

  const { data: site, error: siteErr } = await admin
    .from("mc_sites")
    .upsert(
      {
        organization_id: org.id,
        code: "DEMO-MC-001",
        name: "Obra Demonstração MapaConcreto",
        description:
          "Dados fictícios de demonstração — não representam obra real.",
        is_demo: true,
        created_by: userId,
      },
      { onConflict: "organization_id,code" },
    )
    .select("id")
    .single();

  if (siteErr || !site) {
    console.error("Falha ao criar obra demo:", siteErr?.message);
    console.error(
      "Confirme que a migration 00007_mapaconcreto.sql foi aplicada.",
    );
    process.exit(1);
  }

  const { data: building } = await admin
    .from("mc_buildings")
    .insert({
      site_id: site.id,
      organization_id: org.id,
      code: "T-DEMO",
      name: "Torre Demonstração",
    })
    .select("id")
    .single();

  const { data: floor } = await admin
    .from("mc_floors")
    .insert({
      building_id: building.id,
      organization_id: org.id,
      name: "Pavimento tipo (demo)",
      level_index: 1,
    })
    .select("id")
    .single();

  const storagePath = `${org.id}/mapas/${site.id}/DEMO_${hash.slice(0, 12)}.pdf`;
  await admin.storage.from(BUCKET).upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });

  // Calibrated: 200 pdf units = 5 m → 0.025 m/unit; laje 8x5 m = 320x200 pdf units at origin
  const mpu = 0.025;
  const { data: drawing } = await admin
    .from("mc_drawing_revisions")
    .insert({
      site_id: site.id,
      floor_id: floor.id,
      organization_id: org.id,
      revision_code: "R00",
      title: "Planta demo laje 40 m²",
      file_name: "mapaconcreto-demo.pdf",
      storage_path: storagePath,
      content_hash: hash,
      mime_type: "application/pdf",
      page_count: 1,
      selected_page: 1,
      scale_p1: [90, 300],
      scale_p2: [290, 300],
      scale_real_m: 5,
      meters_per_pdf_unit: mpu,
      unit: "m",
      is_demo: true,
      created_by: userId,
    })
    .select("id")
    .single();

  const elementGeom = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [8, 0],
        [8, 5],
        [0, 5],
        [0, 0],
      ],
    ],
  };
  const { data: element } = await admin
    .from("mc_structural_elements")
    .upsert(
      {
        site_id: site.id,
        floor_id: floor.id,
        drawing_revision_id: drawing.id,
        organization_id: org.id,
        code: "LJ-DEMO-40",
        name: "Laje demonstração 40 m²",
        kind: "laje",
        geometry: elementGeom,
        area_m2: 40,
        thickness_m: 0.15,
        volume_teorico_m3: 6,
        quantity_source: "demo",
        reliability: "demonstracao",
        is_demo: true,
        created_by: userId,
      },
      { onConflict: "site_id,code" },
    )
    .select("id")
    .single();

  const regionGeom = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [5, 0],
        [5, 5],
        [0, 5],
        [0, 0],
      ],
    ],
  };
  // Clear previous demo regions/deliveries for idempotent re-seed of geometry cases
  await admin.from("mc_mapped_regions").delete().eq("site_id", site.id).eq("is_demo", true);

  const { data: region } = await admin
    .from("mc_mapped_regions")
    .insert({
      site_id: site.id,
      drawing_revision_id: drawing.id,
      organization_id: org.id,
      name: "Região demo A 25 m²",
      tool: "rectangle",
      geometry: regionGeom,
      area_m2: 25,
      color: "#E00024",
      notes: "Demonstração — interseção 25 m² → 62,5% / 3,75 m³",
      is_demo: true,
      created_by: userId,
    })
    .select("id")
    .single();

  // Segunda região sobreposta (3–8 × 0–5 = 25 m²) → união com A = 40 m² (100%)
  const region2Geom = {
    type: "Polygon",
    coordinates: [
      [
        [3, 0],
        [8, 0],
        [8, 5],
        [3, 5],
        [3, 0],
      ],
    ],
  };
  const { data: region2 } = await admin
    .from("mc_mapped_regions")
    .insert({
      site_id: site.id,
      drawing_revision_id: drawing.id,
      organization_id: org.id,
      name: "Região demo B (sobrepõe A)",
      tool: "rectangle",
      geometry: region2Geom,
      area_m2: 25,
      color: "#175cd3",
      notes: "Demonstração — sobreposição; acumulado por união = 40 m²",
      is_demo: true,
      created_by: userId,
    })
    .select("id")
    .single();

  await admin.from("mc_region_element_intersections").upsert(
    {
      organization_id: org.id,
      region_id: region.id,
      element_id: element.id,
      intersection_area_m2: 25,
      percent: 62.5,
      volume_estimado_m3: 3.75,
      method: "slab_constant_thickness",
      data_origin: "demo_seed",
      precision_note: "Caso de aceite da especificação",
      warnings: [],
      indeterminate: false,
    },
    { onConflict: "region_id,element_id" },
  );
  await admin.from("mc_region_element_intersections").upsert(
    {
      organization_id: org.id,
      region_id: region2.id,
      element_id: element.id,
      intersection_area_m2: 25,
      percent: 62.5,
      volume_estimado_m3: 3.75,
      method: "slab_constant_thickness",
      data_origin: "demo_seed",
      precision_note: "2ª etapa — não somar %; usar união",
      warnings: [],
      indeterminate: false,
    },
    { onConflict: "region_id,element_id" },
  );

  const { data: pour } = await admin
    .from("mc_concrete_pours")
    .upsert(
      {
        site_id: site.id,
        floor_id: floor.id,
        organization_id: org.id,
        code: "C-DEMO-01",
        title: "Concretagem demonstração — 1ª etapa",
        status: "em_execucao",
        pour_date: new Date().toISOString().slice(0, 10),
        fck_mpa: 30,
        slump_spec_mm: 100,
        volume_planned_m3: 4,
        notes: "Demonstração",
        is_demo: true,
        created_by: userId,
      },
      { onConflict: "site_id,code" },
    )
    .select("id")
    .single();

  const { data: pour2 } = await admin
    .from("mc_concrete_pours")
    .upsert(
      {
        site_id: site.id,
        floor_id: floor.id,
        organization_id: org.id,
        code: "C-DEMO-02",
        title: "Concretagem demonstração — 2ª etapa (união)",
        status: "em_execucao",
        pour_date: new Date().toISOString().slice(0, 10),
        fck_mpa: 30,
        slump_spec_mm: 100,
        volume_planned_m3: 3,
        notes: "Demonstração — percentual acumulado por união das regiões",
        is_demo: true,
        created_by: userId,
      },
      { onConflict: "site_id,code" },
    )
    .select("id")
    .single();

  await admin.from("mc_pour_regions").upsert({
    pour_id: pour.id,
    region_id: region.id,
    organization_id: org.id,
  });
  await admin.from("mc_pour_elements").upsert({
    pour_id: pour.id,
    element_id: element.id,
    organization_id: org.id,
  });
  await admin.from("mc_pour_regions").upsert([
    { pour_id: pour2.id, region_id: region.id, organization_id: org.id },
    { pour_id: pour2.id, region_id: region2.id, organization_id: org.id },
  ]);
  await admin.from("mc_pour_elements").upsert({
    pour_id: pour2.id,
    element_id: element.id,
    organization_id: org.id,
  });

  await admin
    .from("mc_truck_deliveries")
    .delete()
    .eq("site_id", site.id)
    .eq("is_demo", true);

  const { data: delivery } = await admin
    .from("mc_truck_deliveries")
    .insert({
      organization_id: org.id,
      site_id: site.id,
      pour_id: pour.id,
      plate: "DEM0A00",
      nf_number: "NF-DEMO-1001",
      volume_nf_m3: 4.0,
      volume_returned_m3: 0.2,
      volume_other_dest_m3: 0,
      notes: "Demonstração — 1 NF → 2 regiões",
      is_demo: true,
      created_by: userId,
    })
    .select("id")
    .single();

  const { data: delivery2 } = await admin
    .from("mc_truck_deliveries")
    .insert({
      organization_id: org.id,
      site_id: site.id,
      pour_id: pour2.id,
      plate: "DEM0B00",
      nf_number: "NF-DEMO-1002",
      volume_nf_m3: 2.0,
      volume_returned_m3: 0,
      volume_other_dest_m3: 0,
      notes: "Demonstração — 2ª NF na mesma região A",
      is_demo: true,
      created_by: userId,
    })
    .select("id")
    .single();

  await admin.from("mc_delivery_region_allocations").insert([
    {
      organization_id: org.id,
      delivery_id: delivery.id,
      region_id: region.id,
      volume_allocated_m3: 2.0,
      volume_discharged_m3: 2.0,
    },
    {
      organization_id: org.id,
      delivery_id: delivery.id,
      region_id: region2.id,
      volume_allocated_m3: 1.8,
      volume_discharged_m3: 1.8,
    },
    {
      organization_id: org.id,
      delivery_id: delivery2.id,
      region_id: region.id,
      volume_allocated_m3: 2.0,
      volume_discharged_m3: 2.0,
    },
  ]);

  await admin.from("mc_slump_tests").insert({
    organization_id: org.id,
    delivery_id: delivery.id,
    measured_mm: 95,
    slump_spec_mm: 100,
    tolerance_mm: 10,
    compliant: true,
    responsible_name: "Técnico Demo",
    notes: "Slump de demonstração",
    is_demo: true,
    created_by: userId,
  });

  // Pilar sem altura → volume indeterminado (aceite §12.11)
  await admin.from("mc_structural_elements").upsert(
    {
      site_id: site.id,
      floor_id: floor.id,
      drawing_revision_id: drawing.id,
      organization_id: org.id,
      code: "P-DEMO-01",
      name: "Pilar demo sem altura",
      kind: "pilar",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0.5, 0.5],
            [1.0, 0.5],
            [1.0, 1.0],
            [0.5, 1.0],
            [0.5, 0.5],
          ],
        ],
      },
      area_m2: 0.25,
      height_m: null,
      volume_teorico_m3: null,
      quantity_source: "demo",
      reliability: "indeterminado_sem_altura",
      is_demo: true,
      created_by: userId,
    },
    { onConflict: "site_id,code" },
  );

  // Viga com duas etapas de comprimento (multi-etapa)
  const { data: beam } = await admin
    .from("mc_structural_elements")
    .upsert(
      {
        site_id: site.id,
        floor_id: floor.id,
        drawing_revision_id: drawing.id,
        organization_id: org.id,
        code: "VG-DEMO-01",
        name: "Viga demo multi-etapa",
        kind: "viga",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 4.7],
              [8, 4.7],
              [8, 5],
              [0, 5],
              [0, 4.7],
            ],
          ],
        },
        area_m2: 2.4,
        section_area_m2: 0.12,
        axis_length_m: 8,
        executed_length_m: null,
        volume_teorico_m3: 0.96,
        quantity_source: "demo",
        reliability: "demonstracao",
        is_demo: true,
        created_by: userId,
      },
      { onConflict: "site_id,code" },
    )
    .select("id")
    .single();

  if (beam?.id) {
    await admin.from("mc_pour_elements").upsert(
      {
        pour_id: pour.id,
        element_id: beam.id,
        organization_id: org.id,
        executed_length_m: 3.5,
      },
      { onConflict: "pour_id,element_id" },
    );
    await admin.from("mc_pour_elements").upsert(
      {
        pour_id: pour2.id,
        element_id: beam.id,
        organization_id: org.id,
        executed_length_m: 2.5,
      },
      { onConflict: "pour_id,element_id" },
    );
  }

  // Vazio/ilha demo na região A (1×1 m)
  await admin
    .from("mc_mapped_regions")
    .update({
      voids: [
        {
          type: "Polygon",
          coordinates: [
            [
              [1, 1],
              [2, 1],
              [2, 2],
              [1, 2],
              [1, 1],
            ],
          ],
        },
      ],
      area_m2: 24,
      notes:
        "Demonstração — interseção 25 m² com vazio 1 m² (ilha); aceite base 62,5%/3,75 m³ na interseção bruta documentada",
    })
    .eq("id", region.id);

  // Ocorrência + nota de campo (Fase 4)
  await admin.from("mc_site_occurrences").delete().eq("site_id", site.id).eq("is_demo", true);
  await admin.from("mc_site_occurrences").insert({
    organization_id: org.id,
    site_id: site.id,
    pour_id: pour.id,
    title: "Ocorrência demo — verificação de cimbramento",
    description: "Dados fictícios de demonstração.",
    severity: "media",
    status: "aberta",
    responsible_name: "Eng. Demo",
    due_date: new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10),
    is_demo: true,
    created_by: userId,
  });
  await admin.from("mc_field_notes").delete().eq("site_id", site.id).eq("is_demo", true);
  await admin.from("mc_field_notes").insert({
    organization_id: org.id,
    site_id: site.id,
    pour_id: pour.id,
    note: "Nota de campo demo — frente N liberada para descarga.",
    is_demo: true,
    created_by: userId,
  });

  console.log("Seed MapaConcreto (DEMONSTRAÇÃO) concluído.");
  console.log(`  Org: ${org.name} (${org.id})`);
  console.log(`  Obra: DEMO-MC-001 (${site.id})`);
  console.log(`  Planta: ${drawing.id}`);
  console.log(`  PDF local: public/demo/mapaconcreto-demo.pdf`);
  console.log(
    "  Aceite: 40∩25×0,15 → 62,5%/3,75 m³; união A∪B; NF N:N; Slump; pilar indeterminado; viga multi-etapa; vazio; ocorrência",
  );
  console.log("  UI: /mapas → DEMO-MC-001 · /mapas/aceitacao · /painel · /rastreio");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
