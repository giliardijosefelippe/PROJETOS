#!/usr/bin/env node
/**
 * Seed demo — Lunardeli Engenharia Conferência de Projetos
 * Requires: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in .env.local
 * Optional: SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD and peers for roles.
 *
 * Usage: npm run seed
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

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
    "Configure NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local antes do seed.",
  );
  process.exit(1);
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const USERS = [
  {
    email: process.env.SEED_ADMIN_EMAIL || "admin@lunardeli.local",
    password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe-Admin-123!",
    full_name: "Admin Demo",
    role: "admin",
  },
  {
    email: process.env.SEED_COORD_EMAIL || "coordenador@lunardeli.local",
    password: process.env.SEED_COORD_PASSWORD || "ChangeMe-Coord-123!",
    full_name: "Coordenador Demo",
    role: "coordenador",
  },
  {
    email: process.env.SEED_DESENHISTA_EMAIL || "desenhista@lunardeli.local",
    password: process.env.SEED_DESENHISTA_PASSWORD || "ChangeMe-Des-123!",
    full_name: "Desenhista Demo",
    role: "desenhista",
  },
  {
    email: process.env.SEED_CONFERENTE_EMAIL || "conferente@lunardeli.local",
    password: process.env.SEED_CONFERENTE_PASSWORD || "ChangeMe-Conf-123!",
    full_name: "Conferente Demo",
    role: "conferente",
  },
];

const CATALOG = {
  FORMA: {
    name: "Forma",
    items: [
      {
        code: "FOR-01",
        title: "Identificação do projeto, pavimento, níveis e revisão",
        objective: "Confirmar carimbo e identificação da prancha.",
        steps: [
          "Conferir nome do projeto e código",
          "Conferir pavimento/nível",
          "Conferir revisão e data",
        ],
        verifiable_parameter: "Carimbo completo e legível",
        acceptance_criteria: "Dados coerentes com o projeto",
        priority: "alta",
        is_blocking: true,
      },
      {
        code: "FOR-02",
        title: "Eixos, cotas gerais/parciais e consistência geométrica",
        objective: "Verificar eixos e cotas sem inconsistências óbvias.",
        steps: ["Conferir eixos principais", "Conferir cotas gerais", "Amostrar cotas parciais"],
        verifiable_parameter: "Eixos e cotas legíveis e coerentes",
        acceptance_criteria: "Sem conflitos grosseiros de geometria",
        priority: "alta",
        is_blocking: true,
      },
      {
        code: "FOR-03",
        title: "Pilares, vigas, lajes, aberturas e reservas identificados",
        objective: "Elementos nomeados corretamente na planta.",
        steps: ["Listar pilares", "Listar vigas", "Conferir aberturas/rebaixos"],
        verifiable_parameter: "Identificadores únicos por elemento",
        acceptance_criteria: "Sem omissões evidentes de identificação",
        priority: "media",
        is_blocking: false,
      },
      {
        code: "FOR-04",
        title: "Seções e dimensões legíveis",
        objective: "Dimensões indicadas de forma legível.",
        steps: ["Amostrar seções de vigas", "Amostrar espessuras de lajes"],
        verifiable_parameter: "Textos e cotas legíveis na escala de plotagem",
        acceptance_criteria: "Sem sobreposição que impeça leitura",
        priority: "media",
        is_blocking: false,
      },
      {
        code: "FOR-05",
        title: "Numeração de vigas e lajes sem duplicidades indevidas",
        objective: "Evitar IDs duplicados indevidos.",
        steps: ["Varredura de IDs de vigas", "Varredura de IDs de lajes"],
        verifiable_parameter: "Lista de IDs únicos",
        acceptance_criteria: "Sem duplicidade injustificada",
        priority: "alta",
        is_blocking: true,
      },
      {
        code: "FOR-06",
        title: "Correspondência planta de forma × tabela de vigas",
        objective: "Vigas desenhadas presentes na tabela e vice-versa.",
        steps: ["Extrair vigas da planta", "Comparar com tabela"],
        verifiable_parameter: "Conjunto planta vs tabela",
        acceptance_criteria: "Correspondência completa ou desvios justificados",
        priority: "critica",
        is_blocking: true,
      },
    ],
  },
  VIGAS: {
    name: "Vigas",
    items: [
      {
        code: "VIG-01",
        title: "Levantamento independente das vigas da forma (antes da tabela)",
        objective: "Levantar vigas pela planta, sem copiar a tabela.",
        steps: ["Marcar vigas na forma", "Registrar seções aparentes", "Só então abrir a tabela"],
        verifiable_parameter: "Lista própria do desenhista/conferente",
        acceptance_criteria: "Levantamento documentado antes da comparação",
        priority: "critica",
        is_blocking: true,
        media_caption: "Exemplo didático — não normativo",
      },
      {
        code: "VIG-02",
        title: "IDs e seções compatíveis entre forma, tabela e detalhamento",
        objective: "Compatibilidade de identificação e seção.",
        steps: ["Comparar ID", "Comparar seção bxh", "Conferir detalhe"],
        verifiable_parameter: "Triângulo forma–tabela–detalhe",
        acceptance_criteria: "Sem divergência não justificada",
        priority: "critica",
        is_blocking: true,
      },
      {
        code: "VIG-03",
        title: "Armaduras longitudinais +/− : qtd, Ø, posição e continuidade",
        objective: "Conferir armadura longitudinal.",
        steps: ["Positivas", "Negativas", "Continuidade / emendas"],
        verifiable_parameter: "Quantidade, diâmetro e posição",
        acceptance_criteria: "Dados coerentes no detalhe",
        priority: "alta",
        is_blocking: true,
      },
      {
        code: "VIG-04",
        title: "Estribos: Ø, espaçamento, trechos e quantidade",
        objective: "Conferir estribos.",
        steps: ["Diâmetro", "Espaçamento por trecho", "Quantidade"],
        verifiable_parameter: "Tabela/detalhe de estribos",
        acceptance_criteria: "Informações legíveis e coerentes",
        priority: "alta",
        is_blocking: false,
      },
      {
        code: "VIG-05",
        title: "Cortes, apoios, ancoragens e regiões especiais",
        objective: "Detalhes especiais presentes quando aplicáveis.",
        steps: ["Apoios", "Ancoragens/transpasse", "Regiões especiais"],
        verifiable_parameter: "Presença dos detalhes exigidos pelo projeto",
        acceptance_criteria: "Itens aplicáveis presentes ou N/A justificado",
        priority: "media",
        is_blocking: false,
      },
      {
        code: "VIG-06",
        title: "Tabelas, quantitativos e detalhes coerentes entre pranchas",
        objective: "Coerência entre documentos.",
        steps: ["Cruzar quantitativos", "Cruzar notas"],
        verifiable_parameter: "Sem contradição entre pranchas",
        acceptance_criteria: "Desvios documentados",
        priority: "media",
        is_blocking: false,
      },
    ],
  },
  LAJES: {
    name: "Lajes",
    items: [
      {
        code: "LAJ-01",
        title: "Identificação, espessura, nível e geometria de cada laje",
        objective: "Cada laje identificada com atributos básicos.",
        steps: ["ID", "Espessura", "Nível", "Contorno"],
        verifiable_parameter: "Atributos preenchidos",
        acceptance_criteria: "Sem omissão de lajes da forma",
        priority: "alta",
        is_blocking: true,
      },
      {
        code: "LAJ-02",
        title: "Compatibilidade com planta de forma (limites, aberturas, apoios)",
        objective: "Contorno e aberturas batem com a forma.",
        steps: ["Sobrepor limites", "Conferir aberturas", "Conferir apoios"],
        verifiable_parameter: "Correspondência geométrica",
        acceptance_criteria: "Sem desvio não justificado",
        priority: "critica",
        is_blocking: true,
      },
      {
        code: "LAJ-03",
        title: "Armadura positiva: orientação, qtd, Ø e espaçamento",
        objective: "Conferir armadura positiva.",
        steps: ["Orientação", "Diâmetro", "Espaçamento"],
        verifiable_parameter: "Dados da armadura positiva",
        acceptance_criteria: "Informações legíveis e coerentes",
        priority: "alta",
        is_blocking: true,
      },
      {
        code: "LAJ-04",
        title: "Armadura negativa: orientação, qtd, Ø e espaçamento",
        objective: "Conferir armadura negativa.",
        steps: ["Orientação", "Diâmetro", "Espaçamento"],
        verifiable_parameter: "Dados da armadura negativa",
        acceptance_criteria: "Informações legíveis e coerentes",
        priority: "alta",
        is_blocking: true,
      },
      {
        code: "LAJ-05",
        title: "Reforços em aberturas e detalhes específicos",
        objective: "Reforços quando aplicáveis.",
        steps: ["Mapear aberturas", "Ver reforços", "N/A se não houver"],
        verifiable_parameter: "Detalhe de reforço ou N/A justificado",
        acceptance_criteria: "Casos aplicáveis tratados",
        priority: "media",
        is_blocking: false,
      },
      {
        code: "LAJ-06",
        title: "Notas, tabelas, cortes e compatibilização",
        objective: "Legibilidade e coerência documental.",
        steps: ["Notas", "Tabelas", "Cortes", "Cruzamento com outras pranchas"],
        verifiable_parameter: "Documentação legível",
        acceptance_criteria: "Sem contradição evidente",
        priority: "media",
        is_blocking: false,
      },
    ],
  },
};

async function ensureUser(u) {
  const { data: listed } = await admin.auth.admin.listUsers({ perPage: 200 });
  const existing = listed?.users?.find((x) => x.email === u.email);
  if (existing) {
    await admin.from("users_profiles").upsert({
      user_id: existing.id,
      full_name: u.full_name,
      email: u.email,
    });
    return existing.id;
  }
  const { data, error } = await admin.auth.admin.createUser({
    email: u.email,
    password: u.password,
    email_confirm: true,
    user_metadata: { full_name: u.full_name },
  });
  if (error) throw error;
  await admin.from("users_profiles").upsert({
    user_id: data.user.id,
    full_name: u.full_name,
    email: u.email,
  });
  return data.user.id;
}

async function upsertTemplate(orgId, typeId, activity, catalogKey, userId) {
  const cat = CATALOG[catalogKey];
  const name = `${cat.name} — ${activity === "producao" ? "Produção" : "Conferência"}`;

  const { data: existing } = await admin
    .from("checklist_templates")
    .select("id")
    .eq("organization_id", orgId)
    .eq("drawing_type_id", typeId)
    .eq("activity_kind", activity)
    .eq("name", name)
    .maybeSingle();

  let templateId = existing?.id;
  if (!templateId) {
    const { data, error } = await admin
      .from("checklist_templates")
      .insert({
        organization_id: orgId,
        name,
        drawing_type_id: typeId,
        activity_kind: activity,
        status: "draft",
        created_by: userId,
      })
      .select("id")
      .single();
    if (error) throw error;
    templateId = data.id;
  }

  const { data: version, error: vErr } = await admin
    .from("checklist_template_versions")
    .insert({
      template_id: templateId,
      organization_id: orgId,
      version_number: 1,
      status: "draft",
    })
    .select("id")
    .single();

  // If v1 exists, skip recreate
  if (vErr) {
    const { data: published } = await admin
      .from("checklist_template_versions")
      .select("id")
      .eq("template_id", templateId)
      .eq("version_number", 1)
      .maybeSingle();
    if (published) {
      await admin
        .from("checklist_templates")
        .update({ current_version_id: published.id, status: "published" })
        .eq("id", templateId);
      return templateId;
    }
    throw vErr;
  }

  const { data: section } = await admin
    .from("checklist_sections")
    .insert({
      template_version_id: version.id,
      title: "Verificações principais",
      sort_order: 1,
    })
    .select("id")
    .single();

  let order = 0;
  for (const item of cat.items) {
    order += 1;
    const { data: inserted } = await admin
      .from("checklist_items")
      .insert({
        template_version_id: version.id,
        section_id: section.id,
        code: item.code,
        title: item.title,
        objective: item.objective,
        steps: item.steps,
        verifiable_parameter: item.verifiable_parameter,
        acceptance_criteria: item.acceptance_criteria,
        technical_reference: {
          note: "Referência configurável (ex. NBR 6118) — verificar edição vigente. Conteúdo didático, não normativo.",
          norm: null,
          edition: null,
          item: null,
        },
        priority: item.priority,
        is_blocking: item.is_blocking,
        instructions: "Conteúdo didático editável pelo administrador.",
        sort_order: order,
      })
      .select("id")
      .single();

    if (inserted && item.media_caption) {
      await admin.from("checklist_item_media").insert({
        item_id: inserted.id,
        kind: "highlight",
        external_url:
          "https://placehold.co/640x360/F5F5F5/E00024/png?text=Referencia+didatica",
        caption: item.media_caption,
        sort_order: 1,
      });
      await admin.from("checklist_item_media").insert({
        item_id: inserted.id,
        kind: "video",
        external_url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        caption: "Vídeo demonstrativo (placeholder — substituir)",
        sort_order: 2,
      });
    }
  }

  await admin
    .from("checklist_template_versions")
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      published_by: userId,
      snapshot_note: "Seed Forma/Vigas/Lajes — didático",
    })
    .eq("id", version.id);

  await admin
    .from("checklist_templates")
    .update({
      status: "published",
      current_version_id: version.id,
    })
    .eq("id", templateId);

  return templateId;
}

async function main() {
  console.log("Seed Lunardeli — iniciando…");

  const orgName = process.env.SEED_ORGANIZATION_NAME || "Lunardeli Demo";
  const slug = "lunardeli-demo";

  let { data: org } = await admin
    .from("organizations")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();

  if (!org) {
    const { data, error } = await admin
      .from("organizations")
      .insert({
        name: orgName,
        slug,
        settings: {
          product_full_name:
            "Lunardeli Engenharia — Gestão e Qualidade de Projetos Estruturais",
          product_short_name: "Lunardeli | Qualidade",
          brand_color: "#E00024",
        },
      })
      .select("id")
      .single();
    if (error) throw error;
    org = data;
  }

  const userIds = {};
  for (const u of USERS) {
    const id = await ensureUser(u);
    userIds[u.role] = id;
    await admin.from("organization_memberships").upsert(
      {
        organization_id: org.id,
        user_id: id,
        role: u.role,
        status: "active",
      },
      { onConflict: "organization_id,user_id" },
    );
    console.log(`  user ${u.role}: ${u.email}`);
  }

  const types = [
    { code: "FORMA", name: "Forma", sort_order: 1 },
    { code: "VIGAS", name: "Vigas", sort_order: 2 },
    { code: "LAJES", name: "Lajes", sort_order: 3 },
  ];
  const typeIds = {};
  for (const t of types) {
    const { data } = await admin
      .from("drawing_types")
      .upsert(
        {
          organization_id: org.id,
          code: t.code,
          name: t.name,
          sort_order: t.sort_order,
          active: true,
        },
        { onConflict: "organization_id,code" },
      )
      .select("id, code")
      .single();
    typeIds[t.code] = data.id;
  }

  for (const key of Object.keys(CATALOG)) {
    for (const activity of ["producao", "conferencia"]) {
      await upsertTemplate(org.id, typeIds[key], activity, key, userIds.admin);
      console.log(`  template ${key} / ${activity}`);
    }
  }

  // Demo project + vigas drawing
  let { data: project } = await admin
    .from("projects")
    .select("id")
    .eq("organization_id", org.id)
    .eq("code", "DEMO-001")
    .maybeSingle();

  if (!project) {
    const { data, error } = await admin
      .from("projects")
      .insert({
        organization_id: org.id,
        code: "DEMO-001",
        name: "Edifício Demonstração",
        description: "Projeto seed para percorrer o aceite do MVP.",
        created_by: userIds.coordenador,
      })
      .select("id")
      .single();
    if (error) throw error;
    project = data;
  }

  let { data: drawing } = await admin
    .from("drawings")
    .select("id")
    .eq("project_id", project.id)
    .eq("number", "VIG-01")
    .maybeSingle();

  if (!drawing) {
    const { data, error } = await admin
      .from("drawings")
      .insert({
        organization_id: org.id,
        project_id: project.id,
        drawing_type_id: typeIds.VIGAS,
        number: "VIG-01",
        title: "Detalhamento de Vigas — Pavimento Tipo",
        level_label: "Pavimento Tipo",
        created_by: userIds.desenhista,
      })
      .select("id")
      .single();
    if (error) throw error;
    drawing = data;
  }

  const { data: revExisting } = await admin
    .from("drawing_revisions")
    .select("id")
    .eq("drawing_id", drawing.id)
    .eq("revision_code", "R00")
    .maybeSingle();

  if (!revExisting) {
    await admin.from("drawing_revisions").insert({
      drawing_id: drawing.id,
      organization_id: org.id,
      revision_code: "R00",
      workflow_status: "rascunho",
      production_owner_id: userIds.desenhista,
      reviewer_id: userIds.conferente,
      created_by: userIds.desenhista,
    });
  }

  await admin.from("standard_parameters").upsert(
    {
      organization_id: org.id,
      key: "nomenclatura_prancha",
      label: "Nomenclatura de pranchas",
      value: { pattern: "{TIPO}-{NN}" },
      category: "grafismo",
      notes: "Parâmetro interno — sem força normativa automática.",
    },
    { onConflict: "organization_id,key" },
  );

  console.log("\nSeed concluído.");
  console.log("Organização:", orgName, `(${org.id})`);
  console.log("Logins demo (altere as senhas em produção):");
  for (const u of USERS) {
    console.log(`  ${u.role}: ${u.email} / ${u.password}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
