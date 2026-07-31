import { redirect } from "next/navigation";

import { isSupabaseConfigured } from "@/lib/supabase/server";
import { getAccessProfile } from "@/lib/access";
import { getDataScope } from "@/lib/scope";
import type { ModuleAccessInfo } from "@/lib/constants";
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

  // Acceso multi-módulo — define qué módulos ve cada usuario en la nav.
  const profile = await getAccessProfile();
  if (!profile) {
    redirect("/login");
  }

  const access: ModuleAccessInfo = {
    isPlatformAdmin: profile.isPlatformAdmin,
    modules: profile.modules,
  };

  // Alcance por país de operación — el switcher vive en el topbar y el filtro
  // se aplica en el servidor (ver lib/scope).
  const scope = await getDataScope();

  return (
    <div className="min-h-screen bg-background">
      <Topbar
        userEmail={profile.email}
        access={access}
        scopeCountries={scope.countries.map((c) => ({ iso2: c.iso2, name: c.name }))}
        activeScope={scope.country?.iso2 ?? null}
      />
      <Sidebar access={access} />
      <BottomNav access={access} />
      {/* Desktop: padding-left para sidebar (w-14). Mobile: padding-bottom
          para que el bottom-nav (h-16 aprox + safe-area) no tape contenido. */}
      <div className="pt-14 md:pl-14 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </div>
    </div>
  );
}
