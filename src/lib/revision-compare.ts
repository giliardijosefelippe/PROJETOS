import type { ResponseStatus, WorkflowStatus } from "@/lib/types/domain";

export type RevisionMeta = {
  id: string;
  revision_code: string;
  workflow_status: WorkflowStatus | string;
  immutable: boolean;
  approved_at?: string | null;
};

export type ResponseRow = {
  code: string;
  title: string;
  status: ResponseStatus | string;
  comment?: string | null;
  activity_kind?: string;
};

export type ResponseDiff = {
  code: string;
  title: string;
  leftStatus: string | null;
  rightStatus: string | null;
  leftComment?: string | null;
  rightComment?: string | null;
  change: "added" | "removed" | "status_changed" | "comment_changed" | "unchanged";
};

export function compareRevisionResponses(
  left: ResponseRow[],
  right: ResponseRow[],
): ResponseDiff[] {
  const lMap = new Map(left.map((r) => [r.code, r]));
  const rMap = new Map(right.map((r) => [r.code, r]));
  const codes = new Set([...lMap.keys(), ...rMap.keys()]);
  const out: ResponseDiff[] = [];

  for (const code of [...codes].sort()) {
    const l = lMap.get(code);
    const r = rMap.get(code);
    if (l && !r) {
      out.push({
        code,
        title: l.title,
        leftStatus: String(l.status),
        rightStatus: null,
        leftComment: l.comment,
        change: "removed",
      });
      continue;
    }
    if (!l && r) {
      out.push({
        code,
        title: r.title,
        leftStatus: null,
        rightStatus: String(r.status),
        rightComment: r.comment,
        change: "added",
      });
      continue;
    }
    if (l && r) {
      let change: ResponseDiff["change"] = "unchanged";
      if (l.status !== r.status) change = "status_changed";
      else if ((l.comment || "") !== (r.comment || "")) change = "comment_changed";
      out.push({
        code,
        title: r.title || l.title,
        leftStatus: String(l.status),
        rightStatus: String(r.status),
        leftComment: l.comment,
        rightComment: r.comment,
        change,
      });
    }
  }
  return out;
}

export function summarizeDiff(diff: ResponseDiff[]) {
  return {
    total: diff.length,
    added: diff.filter((d) => d.change === "added").length,
    removed: diff.filter((d) => d.change === "removed").length,
    status_changed: diff.filter((d) => d.change === "status_changed").length,
    comment_changed: diff.filter((d) => d.change === "comment_changed").length,
    unchanged: diff.filter((d) => d.change === "unchanged").length,
  };
}
