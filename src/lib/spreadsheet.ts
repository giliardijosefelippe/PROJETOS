/**
 * Import/export de itens de checklist e listagens — CSV (Excel abre nativamente).
 * Sem dependência de serviço externo. Formato documentado para planilha.
 */

export type ChecklistImportRow = {
  section_title: string;
  code: string;
  title: string;
  objective?: string;
  steps?: string;
  verifiable_parameter?: string;
  acceptance_criteria?: string;
  priority?: string;
  is_blocking?: boolean;
  instructions?: string;
  technical_reference_note?: string;
};

const HEADER = [
  "section_title",
  "code",
  "title",
  "objective",
  "steps",
  "verifiable_parameter",
  "acceptance_criteria",
  "priority",
  "is_blocking",
  "instructions",
  "technical_reference_note",
] as const;

export function escapeCsvCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function rowsToCsv(
  headers: string[],
  rows: Array<Record<string, unknown>>,
): string {
  const lines = [headers.map(escapeCsvCell).join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => escapeCsvCell(row[h])).join(","));
  }
  // BOM para Excel pt-BR
  return `\uFEFF${lines.join("\n")}`;
}

export function checklistItemsToCsv(
  items: Array<{
    section_title: string;
    code: string;
    title: string;
    objective?: string | null;
    steps?: unknown;
    verifiable_parameter?: string | null;
    acceptance_criteria?: string | null;
    priority?: string;
    is_blocking?: boolean;
    instructions?: string | null;
    technical_reference?: { note?: string } | null;
  }>,
): string {
  const rows = items.map((i) => ({
    section_title: i.section_title,
    code: i.code,
    title: i.title,
    objective: i.objective || "",
    steps: Array.isArray(i.steps) ? i.steps.join(" | ") : String(i.steps || ""),
    verifiable_parameter: i.verifiable_parameter || "",
    acceptance_criteria: i.acceptance_criteria || "",
    priority: i.priority || "media",
    is_blocking: i.is_blocking ? "true" : "false",
    instructions: i.instructions || "",
    technical_reference_note: i.technical_reference?.note || "",
  }));
  return rowsToCsv([...HEADER], rows);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      cells.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  cells.push(cur);
  return cells;
}

export function parseChecklistCsv(text: string): {
  rows: ChecklistImportRow[];
  errors: string[];
} {
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  if (!cleaned) return { rows: [], errors: ["Arquivo CSV vazio."] };

  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    return { rows: [], errors: ["CSV precisa de cabeçalho e ao menos uma linha."] };
  }

  const header = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const required = ["section_title", "code", "title"];
  for (const r of required) {
    if (!header.includes(r)) {
      return {
        rows: [],
        errors: [`Coluna obrigatória ausente: ${r}. Cabeçalho esperado: ${HEADER.join(", ")}`],
      };
    }
  }

  const rows: ChecklistImportRow[] = [];
  const errors: string[] = [];
  const validPriorities = new Set(["baixa", "media", "alta", "critica"]);

  for (let i = 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const obj: Record<string, string> = {};
    header.forEach((h, idx) => {
      obj[h] = (cells[idx] || "").trim();
    });
    if (!obj.code || !obj.title || !obj.section_title) {
      errors.push(`Linha ${i + 1}: section_title, code e title são obrigatórios.`);
      continue;
    }
    const priority = (obj.priority || "media").toLowerCase();
    if (!validPriorities.has(priority)) {
      errors.push(`Linha ${i + 1}: prioridade inválida (${obj.priority}).`);
      continue;
    }
    rows.push({
      section_title: obj.section_title,
      code: obj.code,
      title: obj.title,
      objective: obj.objective || undefined,
      steps: obj.steps || undefined,
      verifiable_parameter: obj.verifiable_parameter || undefined,
      acceptance_criteria: obj.acceptance_criteria || undefined,
      priority,
      is_blocking: ["true", "1", "sim", "yes"].includes(
        (obj.is_blocking || "").toLowerCase(),
      ),
      instructions: obj.instructions || undefined,
      technical_reference_note: obj.technical_reference_note || undefined,
    });
  }

  return { rows, errors };
}

export const CHECKLIST_CSV_TEMPLATE = rowsToCsv([...HEADER], [
  {
    section_title: "Verificações principais",
    code: "EX-01",
    title: "Exemplo de item importado",
    objective: "Objetivo didático",
    steps: "Passo 1 | Passo 2",
    verifiable_parameter: "Parâmetro",
    acceptance_criteria: "Critério",
    priority: "media",
    is_blocking: "false",
    instructions: "Editável pelo admin",
    technical_reference_note:
      "Campo configurável — verificar edição vigente (não normativo)",
  },
]);
