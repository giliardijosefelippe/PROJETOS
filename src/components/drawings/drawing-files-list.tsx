import { Button } from "@/components/ui/button";

export type DrawingFileRow = {
  id: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  kind: string;
  source_format: string | null;
  converter_path: string | null;
  created_at?: string;
  signed_url?: string | null;
};

export function DrawingFilesList({ files }: { files: DrawingFileRow[] }) {
  if (!files.length) {
    return (
      <p className="text-sm text-ink-muted">
        Nenhum arquivo de prancha ainda. Envie PDF, DXF ou DWG.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-divider text-sm">
      {files.map((f) => (
        <li
          key={f.id}
          className="flex flex-wrap items-center justify-between gap-2 py-2"
        >
          <div>
            <p className="font-medium">{f.file_name}</p>
            <p className="text-xs text-ink-muted">
              {f.kind}
              {f.source_format ? ` · origem ${f.source_format}` : ""}
              {f.converter_path ? ` · ${f.converter_path}` : ""}
              {" · "}
              {(f.size_bytes / 1024).toFixed(0)} KB
            </p>
          </div>
          {f.signed_url && (
            <a href={f.signed_url} target="_blank" rel="noreferrer">
              <Button type="button" size="sm" variant="secondary">
                Abrir
              </Button>
            </a>
          )}
        </li>
      ))}
    </ul>
  );
}
