/** Comparação de metadados entre versões de template (Etapa C) */

export type TemplateItemMeta = {
  code: string;
  title: string;
  priority: string;
  is_blocking: boolean;
  verifiable_parameter?: string | null;
};

export type VersionSnapshot = {
  version_number: number;
  status: string;
  items: TemplateItemMeta[];
};

export type VersionDiff = {
  added: string[];
  removed: string[];
  changed: Array<{ code: string; fields: string[] }>;
  unchanged: string[];
};

export function compareTemplateVersions(
  a: VersionSnapshot,
  b: VersionSnapshot,
): VersionDiff {
  const mapA = new Map(a.items.map((i) => [i.code, i]));
  const mapB = new Map(b.items.map((i) => [i.code, i]));
  const added: string[] = [];
  const removed: string[] = [];
  const changed: Array<{ code: string; fields: string[] }> = [];
  const unchanged: string[] = [];

  for (const [code, itemB] of mapB) {
    const itemA = mapA.get(code);
    if (!itemA) {
      added.push(code);
      continue;
    }
    const fields: string[] = [];
    if (itemA.title !== itemB.title) fields.push("title");
    if (itemA.priority !== itemB.priority) fields.push("priority");
    if (itemA.is_blocking !== itemB.is_blocking) fields.push("is_blocking");
    if (
      (itemA.verifiable_parameter || "") !==
      (itemB.verifiable_parameter || "")
    ) {
      fields.push("verifiable_parameter");
    }
    if (fields.length) changed.push({ code, fields });
    else unchanged.push(code);
  }
  for (const code of mapA.keys()) {
    if (!mapB.has(code)) removed.push(code);
  }
  return { added, removed, changed, unchanged };
}

/** Snapshot de run permanece independente da versão atual do template. */
export function runUsesFrozenVersion(
  runTemplateVersionId: string,
  currentPublishedVersionId: string | null,
) {
  if (!currentPublishedVersionId) return true;
  return runTemplateVersionId === currentPublishedVersionId
    ? "current"
    : "frozen_historical";
}
