import { uploadDrawingFileAction } from "@/actions/drawing-files";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

export function DrawingUploadForm({
  revisionId,
  immutable,
}: {
  revisionId: string;
  immutable: boolean;
}) {
  if (immutable) {
    return (
      <p className="text-sm text-ink-muted">
        Revisão imutável — anexos de prancha não podem ser alterados.
      </p>
    );
  }

  return (
    <form
      action={uploadDrawingFileAction}
      className="space-y-3"
      encType="multipart/form-data"
    >
      <input type="hidden" name="revision_id" value={revisionId} />
      <div>
        <Label htmlFor="drawing-file">Arquivo da prancha (PDF, DXF ou DWG)</Label>
        <Input
          id="drawing-file"
          name="file"
          type="file"
          required
          accept=".pdf,.dxf,.dwg,application/pdf,application/dxf,application/acad"
        />
        <p className="mt-1 text-xs text-ink-muted">
          DXF → preview via ezdxf (Python). DWG → exige ODA File Converter no
          serviço CAD. PDF entra direto no fluxo de anotações.
        </p>
      </div>
      <Button type="submit">Enviar prancha</Button>
    </form>
  );
}
