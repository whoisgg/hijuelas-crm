import { redirect } from "next/navigation";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { BottomNav } from "@/components/layout/bottom-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Si las envs no están configuradas, mandamos al login (que muestra ayuda).
  if (!isSupabaseConfigured()) {
    redirect("/login");
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Role check — define qué módulos ve cada usuario en la nav.
  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  const role = appUser?.role ?? null;

  return (
    <div className="min-h-screen bg-background">
      <Topbar userEmail={user.email ?? null} role={role} />
      <Sidebar role={role} />
      <BottomNav role={role} />
      {/* Desktop: padding-left para sidebar (w-14). Mobile: padding-bottom
          para que el bottom-nav (h-16 aprox + safe-area) no tape contenido. */}
      <div className="pt-14 md:pl-14 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
    </div>
  );
}
