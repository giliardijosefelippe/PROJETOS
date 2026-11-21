#!/usr/bin/env node
/**
 * Seed MapaConcreto — dados de DEMONSTRAÇÃO (100% idempotente em re-runs)
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 * Prefer running after npm run seed and migrations 00007–00014.
 *
 * Usage:
 *   npm run seed:mapas
 *   node scripts/seed-mapas.mjs --check   # offline (sem secrets): gera PDF + valida plano
 */
import { createClient } from "@supabase/supabase-js";
import { createHash } from "crypto";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "fs";
import { resolve } from "path";
import PDFDocument from "pdfkit";

const CHECK_ONLY = process.argv.includes("--check");

export const DEMO_SITE_CODE = "DEMO-MC-001";
export const DEMO_BUILDING_CODE = "T-DEMO";
export const DEMO_FLOOR_LEVEL = 1;
export const DEMO_DRAWING_FILE = "mapaconcreto-demo.pdf";
export const DEMO_REVISION = "R00";

/** Plano geométrico de aceite — sem inventar volumes. */
export function demoAcceptancePlan() {
  const slab = {
    code: "LJ-DEMO-40",
    areaM2: 40,
    thicknessM: 0.15,
    volumeTeoricoM3: 6,
  };
  const regionA = {
    name: "Região demo A 25 m²",
    areaM2: 25,
    intersectionM2: 25,
    percent: 62.5,
    volumeEstimadoM3: 3.75,
  };
  const regionB = {
    name: "Região demo B (sobrepõe A)",
    areaM2: 25,
  };
  const unionAreaM2 = 40; // A∪B over 8×5 slab
  return {
    slab,
    regionA,
    regionB,
    unionAreaM2,
    acceptance: {
      percent: (regionA.intersectionM2 / slab.areaM2) * 100,
      volumeM3: regionA.intersectionM2 * slab.thicknessM,
    },
  };
}

export function buildDemoPdf() {
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
    doc.moveTo(90, 300).lineTo(290, 300).stroke("#175cd3");
    doc.fillColor("#175cd3").text("barra 5,00 m (calibrar estes extremos)", 90, 305);
    doc.end();
  });
}

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

async function upsertOne(admin, table, row, onConflict) {
  const { data, error } = await admin
    .from(table)
    .upsert(row, { onConflict })
    .select("id")
    .single();
  if (error || !data) {
    throw new Error(`${table} upsert: ${error?.message || "sem id"}`);
  }
  return data;
}

async function findOrCreateBuilding(admin, { siteId, orgId, code, name }) {
  const { data: existing } = await admin
    .from("mc_buildings")
    .select("id")
    .eq("site_id", siteId)
    .eq("code", code)
    .maybeSingle();
  if (existing?.id) {
    await admin
      .from("mc_buildings")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing;
  }
  const { data, error } = await admin
    .from("mc_buildings")
    .insert({
      site_id: siteId,
      organization_id: orgId,
      code,
      name,
    })
    .select("id")
    .single();
  if (error || !data) {
    const { data: again } = await admin
      .from("mc_buildings")
      .select("id")
      .eq("site_id", siteId)
      .eq("code", code)
      .maybeSingle();
    if (again?.id) return again;
    throw new Error(`mc_buildings: ${error?.message || "falha"}`);
  }
  return data;
}

async function findOrCreateFloor(admin, { buildingId, orgId, name, levelIndex }) {
  const { data: existing } = await admin
    .from("mc_floors")
    .select("id")
    .eq("building_id", buildingId)
    .eq("level_index", levelIndex)
    .maybeSingle();
  if (existing?.id) {
    await admin
      .from("mc_floors")
      .update({ name, updated_at: new Date().toISOString() })
      .eq("id", existing.id);
    return existing;
  }
  const { data, error } = await admin
    .from("mc_floors")
    .insert({
      building_id: buildingId,
      organization_id: orgId,
      name,
      level_index: levelIndex,
    })
    .select("id")
    .single();
  if (error || !data) {
    // Race / unique after 00014 — fetch again
    const { data: again } = await admin
      .from("mc_floors")
      .select("id")
      .eq("building_id", buildingId)
      .eq("level_index", levelIndex)
      .maybeSingle();
    if (again?.id) return again;
    throw new Error(`mc_floors: ${error?.message || "falha"}`);
  }
  return data;
}

async function upsertDrawing(admin, row) {
  return upsertOne(
    admin,
    "mc_drawing_revisions",
    row,
    "site_id,revision_code,file_name",
  );
}

async function runCheck() {
  const plan = demoAcceptancePlan();
  if (Math.abs(plan.acceptance.percent - 62.5) > 1e-9) {
    throw new Error("Aceite % inválido no plano demo");
  }
  if (Math.abs(plan.acceptance.volumeM3 - 3.75) > 1e-9) {
    throw new Error("Aceite volume inválido no plano demo");
  }
  const pdf = await buildDemoPdf();
  if (pdf.length < 100 || pdf.subarray(0, 4).toString() !== "%PDF") {
    throw new Error("PDF demo inválido");
  }
  const outDir = resolve(process.cwd(), "public/demo");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, DEMO_DRAWING_FILE), pdf);
  console.log("seed:mapas --check OK (offline)");
  console.log(`  PDF: public/demo/${DEMO_DRAWING_FILE} (${pdf.length} bytes)`);
  console.log(
    `  Aceite plano: ${plan.acceptance.percent}% / ${plan.acceptance.volumeM3} m³`,
  );
}

async function main() {
  if (CHECK_ONLY) {
    await runCheck();
    return;
  }

  loadEnv();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || url.includes("YOUR_PROJECT")) {
    console.error(
      "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.",
    );
    console.error("Sem secrets: rode `node scripts/seed-mapas.mjs --check`.");
    process.exit(1);
  }

  const admin = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const BUCKET = process.env.STORAGE_BUCKET_LIBRARY || "library";

  const { data: orgs } = await admin.from("organizations").select("id, name").limit(1);
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
  writeFileSync(resolve(outDir, DEMO_DRAWING_FILE), pdf);

  const site = await upsertOne(
    admin,
    "mc_sites",
    {
      organization_id: org.id,
      code: DEMO_SITE_CODE,
      name: "Obra Demonstração MapaConcreto",
      description:
        "Dados fictícios de demonstração — não representam obra real.",
      is_demo: true,
      created_by: userId,
    },
    "organization_id,code",
  );

  const building = await findOrCreateBuilding(admin, {
    siteId: site.id,
    orgId: org.id,
    code: DEMO_BUILDING_CODE,
    name: "Torre Demonstração",
  });

  const floor = await findOrCreateFloor(admin, {
    buildingId: building.id,
    orgId: org.id,
    name: "Pavimento tipo (demo)",
    levelIndex: DEMO_FLOOR_LEVEL,
  });

  const storagePath = `${org.id}/mapas/${site.id}/DEMO_${hash.slice(0, 12)}.pdf`;
  await admin.storage.from(BUCKET).upload(storagePath, pdf, {
    contentType: "application/pdf",
    upsert: true,
  });

  const mpu = 0.025;
  const drawing = await upsertDrawing(admin, {
    site_id: site.id,
    floor_id: floor.id,
    organization_id: org.id,
    revision_code: DEMO_REVISION,
    title: "Planta demo laje 40 m²",
    file_name: DEMO_DRAWING_FILE,
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
    updated_at: new Date().toISOString(),
  });

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
  const element = await upsertOne(
    admin,
    "mc_structural_elements",
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
    "site_id,code",
  );

  // Replace demo regions (cascades intersections / pour_regions / allocations)
  await admin
    .from("mc_mapped_regions")
    .delete()
    .eq("site_id", site.id)
    .eq("is_demo", true);

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
  const { data: region, error: regionErr } = await admin
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
  if (regionErr || !region) throw new Error(regionErr?.message || "região A");

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
  const { data: region2, error: region2Err } = await admin
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
  if (region2Err || !region2) throw new Error(region2Err?.message || "região B");

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

  const pour = await upsertOne(
    admin,
    "mc_concrete_pours",
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
    "site_id,code",
  );

  const pour2 = await upsertOne(
    admin,
    "mc_concrete_pours",
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
    "site_id,code",
  );

  // Clear pour links then reattach (idempotent)
  await admin.from("mc_pour_regions").delete().eq("pour_id", pour.id);
  await admin.from("mc_pour_regions").delete().eq("pour_id", pour2.id);
  await admin.from("mc_pour_elements").delete().eq("pour_id", pour.id);
  await admin.from("mc_pour_elements").delete().eq("pour_id", pour2.id);

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

  const { data: delivery, error: delErr } = await admin
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
  if (delErr || !delivery) throw new Error(delErr?.message || "delivery");

  const { data: delivery2, error: del2Err } = await admin
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
  if (del2Err || !delivery2) throw new Error(del2Err?.message || "delivery2");

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

  await upsertOne(
    admin,
    "mc_structural_elements",
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
    "site_id,code",
  );

  const beam = await upsertOne(
    admin,
    "mc_structural_elements",
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
    "site_id,code",
  );

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

  await admin
    .from("mc_site_occurrences")
    .delete()
    .eq("site_id", site.id)
    .eq("is_demo", true);
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

  await admin
    .from("mc_field_notes")
    .delete()
    .eq("site_id", site.id)
    .eq("is_demo", true);
  await admin.from("mc_field_notes").insert({
    organization_id: org.id,
    site_id: site.id,
    pour_id: pour.id,
    note: "Nota de campo demo — frente N liberada para descarga.",
    is_demo: true,
    created_by: userId,
  });

  // Sanity: single building/floor/drawing for demo codes
  const { count: bCount } = await admin
    .from("mc_buildings")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site.id)
    .eq("code", DEMO_BUILDING_CODE);
  const { count: dCount } = await admin
    .from("mc_drawing_revisions")
    .select("id", { count: "exact", head: true })
    .eq("site_id", site.id)
    .eq("revision_code", DEMO_REVISION)
    .eq("file_name", DEMO_DRAWING_FILE);

  console.log("Seed MapaConcreto (DEMONSTRAÇÃO) concluído — idempotente.");
  console.log(`  Org: ${org.name} (${org.id})`);
  console.log(`  Obra: ${DEMO_SITE_CODE} (${site.id})`);
  console.log(`  Building count(code=${DEMO_BUILDING_CODE}): ${bCount}`);
  console.log(`  Drawing count(R00): ${dCount}`);
  console.log(`  Planta: ${drawing.id}`);
  console.log(`  PDF local: public/demo/${DEMO_DRAWING_FILE}`);
  console.log(
    "  Aceite: 40∩25×0,15 → 62,5%/3,75 m³; união A∪B; NF N:N; Slump; pilar; viga; vazio; ocorrência",
  );
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith("seed-mapas.mjs") ||
    process.argv[1].includes("seed-mapas"));

if (isDirect) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
