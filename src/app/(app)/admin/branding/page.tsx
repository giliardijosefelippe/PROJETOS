import { uploadLogoAction } from "@/actions/branding";
import { requireSession } from "@/lib/auth";
import { getOrgLogoSignedUrl } from "@/lib/org";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/input";
import Image from "next/image";

export default async function BrandingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; ok?: string }>;
}) {
  const session = await requireSession(["admin"]);
  const q = await searchParams;
  const logoUrl = await getOrgLogoSignedUrl(session.organizationId);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <div>
        <h2 className="text-2xl font-semibold">Marca</h2>
        <p className="text-sm text-ink-muted">
          Upload/substituição do logotipo oficial da Lunardeli Engenharia.
          Não redesenhar nem inventar variações. O logo é usado no cabeçalho e
          nos PDFs.
        </p>
      </div>

      {q.error && (
        <p className="rounded-md bg-[var(--color-status-danger-bg)] p-3 text-sm text-[var(--color-status-danger)]">
          <span aria-hidden="true">✕ </span>
          {q.error}
        </p>
      )}
      {q.ok && (
        <p className="rounded-md bg-[var(--color-status-ok-bg)] p-3 text-sm text-[var(--color-status-ok)]">
          <span aria-hidden="true">✓ </span>
          {q.ok}
        </p>
      )}

      <div className="rounded-lg border border-border bg-surface p-5">
        <p className="text-sm font-medium">Pré-visualização</p>
        <div className="mt-3 flex h-20 items-center justify-center rounded-md border border-dashed border-divider bg-muted">
          {logoUrl ? (
            <Image
              src={logoUrl}
              alt="Logotipo Lunardeli Engenharia"
              width={200}
              height={64}
              className="max-h-16 w-auto object-contain"
              unoptimized
            />
          ) : (
            <span className="text-sm text-ink-muted">
              Slot do logotipo (aguardando arquivo da marca)
            </span>
          )}
        </div>

        <form action={uploadLogoAction} className="mt-4 space-y-3" encType="multipart/form-data">
          <div>
            <Label htmlFor="logo">Arquivo (PNG, JPG, WEBP ou SVG)</Label>
            <input
              id="logo"
              name="logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/svg+xml"
              required
              className="mt-1 block w-full text-sm"
            />
          </div>
          <Button type="submit">Substituir logotipo</Button>
        </form>

        <p className="mt-4 text-xs text-ink-muted">
          Tokens de cor em <code>src/app/globals.css</code> (
          <code>--color-brand</code> ≈ #E00024 — validar contra arquivo original).
          Referência visual: <code>docs/identidade-visual.md</code>.
        </p>
      </div>
    </div>
  );
}
