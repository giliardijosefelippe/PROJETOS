import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { getSessionContext } from "@/lib/auth";
import { getOrgLogoSignedUrl } from "@/lib/org";
import { isSupabaseConfigured } from "@/lib/env";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const session = await getSessionContext();
  if (!session?.userId) redirect("/login");

  const logoUrl = session.organizationId
    ? await getOrgLogoSignedUrl(session.organizationId)
    : null;

  return (
    <AppShell session={session} logoUrl={logoUrl}>
      {children}
    </AppShell>
  );
}
