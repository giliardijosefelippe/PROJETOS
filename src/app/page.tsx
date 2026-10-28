import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/env";

export default async function HomePage() {
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }
  try {
    const session = await getSessionContext();
    redirect(session?.userId ? "/dashboard" : "/login");
  } catch {
    redirect("/login");
  }
}
