import Link from "next/link";
import { redirect } from "next/navigation";
import { Sprout } from "lucide-react";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import { APP_NAME, appsForRole } from "@/lib/constants";

export const metadata = { title: "Apps" };
export const dynamic = "force-dynamic";

/**
 * Selector de apps de la suite. Flujo: login → /apps → CRM o Planner.
 * Si el rol solo tiene acceso a una app, entra directo sin selector.
 */
export default async function AppsPage() {
  if (!isSupabaseConfigured()) redirect("/login");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: appUser } = await supabase
    .from("app_users")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const apps = appsForRole(appUser?.role ?? null);
  if (apps.length === 1) redirect(apps[0].href);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="flex h-14 items-center gap-2 px-6 font-semibold">
        <Sprout className="h-5 w-5 text-primary" />
        {APP_NAME}
      </header>

      <main className="flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-2xl">
          <h1 className="text-center text-2xl font-semibold">
            ¿Dónde quieres trabajar hoy?
          </h1>
          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {apps.map((app) => {
              const Icon = app.icon;
              return (
                <Link
                  key={app.key}
                  href={app.href}
                  className="group flex flex-col items-center gap-3 rounded-xl border bg-card p-8 text-center transition-colors hover:border-primary/40 hover:bg-accent"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 transition-colors group-hover:bg-primary/15">
                    <Icon className="h-7 w-7 text-primary" />
                  </div>
                  <span className="text-lg font-medium">{app.label}</span>
                  <span className="text-sm text-muted-foreground">
                    {app.description}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
