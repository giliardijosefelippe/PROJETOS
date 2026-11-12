#!/usr/bin/env node
/**
 * Smoke MapaConcreto (offline): test + typecheck + seed:mapas:check
 * + checklist manual impresso. Não exige secrets Supabase.
 *
 * Usage: npm run smoke:mapas
 */
import { spawnSync } from "child_process";
import { resolve } from "path";

const root = process.cwd();

function run(label, command, args) {
  console.log(`\n── ${label} ──`);
  const r = spawnSync(command, args, {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: process.env,
  });
  if (r.status !== 0) {
    console.error(`\nFalha em: ${label} (exit ${r.status})`);
    process.exit(r.status || 1);
  }
}

console.log("MapaConcreto smoke (offline) — sem secrets Supabase");
console.log(`cwd: ${root}`);

run("npm run test", "npm", ["run", "test"]);
run("npm run typecheck", "npm", ["run", "typecheck"]);
run("npm run seed:mapas:check", "npm", ["run", "seed:mapas:check"]);

console.log(`
════════════════════════════════════════════════════════
Checklist manual (com Supabase + app rodando)
════════════════════════════════════════════════════════
[ ] Migrations 00001–00014 aplicadas; buckets library/evidence/reports
[ ] .env.local com URL + anon + service role
[ ] npm run seed && npm run seed:mapas
[ ] npm run dev → login
[ ] /mapas → obra (DEMO-MC-001 ou nova)
[ ] PDF da planta importado (ou R00 do seed)
[ ] Escala calibrada (dois pontos + metros)
[ ] Região desenhada e salva
[ ] Laje cadastrada (aceite: 40∩25 → 62,5% / 3,75 m³)
[ ] Concretagem criada / ligada
[ ] Relatório PDF (raster + esquema + volumes)
[ ] /mapas/aceitacao — critérios §12

Troubleshooting rápido:
  · Sem secrets → este smoke já passou; preencha .env para o browser
  · ODA ausente → use PDF/DXF (DWG opcional)
  · Upload falha → buckets + policies Storage
  · Detalhes → docs/MAPACONCRETO_MERGE.md

Merge stack: #11→#12→#14→#15→#16→#17→#18→#19→#20
════════════════════════════════════════════════════════
`);

console.log("smoke:mapas OK (offline).");
