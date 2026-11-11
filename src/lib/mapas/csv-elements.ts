/**
 * CSV import for structural elements (manual/planilha source).
 * Never invents dimensions — missing numeric fields stay null.
 */

export type ElementCsvRow = {
  code: string;
  name: string;
  kind: string;
  area_m2: number | null;
  thickness_m: number | null;
  height_m: number | null;
  width_m: number | null;
  depth_m: number | null;
  origin_x: number | null;
  origin_y: number | null;
};

const REQUIRED = ["code", "name"] as const;

function parseNum(raw: string | undefined): number | null {
  if (raw == null || String(raw).trim() === "") return null;
  const n = Number(String(raw).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Minimal CSV splitter (supports quotes). */
export function parseCsv(text: string): string[][] {
  const cleaned = text.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }
    if (ch === "\r") continue;
    cell += ch;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

export function parseElementsCsv(text: string): {
  rows: ElementCsvRow[];
  errors: string[];
} {
  const table = parseCsv(text);
  const errors: string[] = [];
  if (table.length < 2) {
    return { rows: [], errors: ["CSV vazio ou sem dados."] };
  }
  const header = table[0].map((h) => h.trim().toLowerCase());
  for (const req of REQUIRED) {
    if (!header.includes(req)) {
      errors.push(`Coluna obrigatória ausente: ${req}`);
    }
  }
  if (errors.length) return { rows: [], errors };

  const idx = (name: string) => header.indexOf(name);
  const rows: ElementCsvRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const line = table[i];
    const code = (line[idx("code")] || "").trim();
    const name = (line[idx("name")] || "").trim();
    if (!code || !name) {
      errors.push(`Linha ${i + 1}: code e name são obrigatórios.`);
      continue;
    }
    rows.push({
      code,
      name,
      kind: (line[idx("kind")] || "laje").trim().toLowerCase() || "laje",
      area_m2: parseNum(line[idx("area_m2")]),
      thickness_m: parseNum(line[idx("thickness_m")]),
      height_m: parseNum(line[idx("height_m")]),
      width_m: parseNum(line[idx("width_m")]),
      depth_m: parseNum(line[idx("depth_m")]),
      origin_x: parseNum(line[idx("origin_x")]),
      origin_y: parseNum(line[idx("origin_y")]),
    });
  }
  return { rows, errors };
}

export function elementsCsvTemplate(): string {
  return (
    "\uFEFFcode,name,kind,area_m2,thickness_m,height_m,width_m,depth_m,origin_x,origin_y\n" +
    "LJ-01,Laje demo,laje,40,0.15,,8,5,0,0\n" +
    "P-01,Pilar demo,pilar,0.16,,2.8,0.4,0.4,1,1\n"
  );
}
