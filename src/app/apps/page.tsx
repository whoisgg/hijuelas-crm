import Link from "next/link";
import { redirect } from "next/navigation";
import { Boxes, ExternalLink, Sprout } from "lucide-react";

import { createClient, isSupabaseConfigured } from "@/lib/supabase/server";
import {
  APP_NAME,
  MODULE_GROUPS,
  modulesForRole,
  type AppModule,
} from "@/lib/constants";
import { listCustomModules } from "@/lib/custom/data";
import { ProposeModuleCard } from "@/components/layout/propose-module";

export const metadata = { title: "Módulos" };
export const dynamic = "force-dynamic";

/**
 * Selector de módulos de la plataforma. Flujo: login → /apps → módulo.
 * Nativos entran a su ruta, enlaces abren en pestaña nueva, "próximamente"
 * se muestran deshabilitados. Ocupa el viewport completo, sin scroll.
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
    .select("role, is_module_builder")
    .eq("id", user.id)
    .maybeSingle();
  const isBuilder = appUser?.role === "admin" || !!appUser?.is_module_builder;

  const modules = modulesForRole(appUser?.role ?? null);
  const custom = await listCustomModules(supabase);
  const visibleCustom = custom.filter(
    (m) => m.status === "live" || isBuilder,
  );
  // Todos los usuarios ven el selector de Hijuelas One, aunque su rol solo
  // tenga un módulo live — da identidad de plataforma y muestra lo que viene.

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      <header className="flex h-14 shrink-0 items-center gap-2 px-6 font-semibold">
        <Sprout className="h-5 w-5 text-primary" />
        {APP_NAME}
      </header>

      <main className="flex flex-1 justify-center overflow-y-auto px-6 py-6">
        <div className="w-full max-w-4xl">
          <h1 className="text-center text-2xl font-semibold">
            ¿Dónde quieres trabajar hoy?
          </h1>
          <div className="mt-6 space-y-6 pb-8">
            {MODULE_GROUPS.map((group) => {
              const items = modules.filter((m) => m.group === group.key);
              if (!items.length) return null;
              return (
                <section key={group.key}>
                  <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    {group.label}
                  </h2>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map((m) => (
                      <ModuleCard key={m.key} module={m} />
                    ))}
                  </div>
                </section>
              );
            })}

            {visibleCustom.length ? (
              <section>
                <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Módulos propios
                </h2>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {visibleCustom.map((m) => (
                    <Link
                      key={m.id}
                      href={`/m/${m.key}`}
                      className="flex min-h-[132px] flex-col rounded-xl border bg-card p-5 text-left transition-colors hover:border-primary/40 hover:bg-accent"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                          <Boxes className="h-6 w-6 text-primary" />
                        </div>
                        {m.status === "draft" ? (
                          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            Borrador
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-3">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {m.description ?? "Módulo propio."}
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            ) : null}

            <section>
              <h2 className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Crecer
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <ProposeModuleCard isBuilder={isBuilder} />
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}

function ModuleCard({ module: m }: { module: AppModule }) {
  const Icon = m.icon;
  const inner = (
    <>
      <div className="flex items-start justify-between">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
          <Icon className="h-6 w-6 text-primary" />
        </div>
        {m.status === "soon" ? (
          <span className="rounded-md bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            Próximamente
          </span>
        ) : m.status === "external" ? (
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        ) : null}
      </div>
      <div className="mt-3">
        <p className="font-medium">{m.label}</p>
        <p className="text-sm text-muted-foreground">{m.description}</p>
      </div>
    </>
  );

  const base = "flex min-h-[132px] flex-col rounded-xl border bg-card p-5 text-left transition-colors";

  if (m.status === "live" && m.href) {
    return (
      <Link href={m.href} className={`${base} hover:border-primary/40 hover:bg-accent`}>
        {inner}
      </Link>
    );
  }
  if (m.status === "external" && m.url) {
    return (
      <a
        href={m.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`${base} hover:border-primary/40 hover:bg-accent`}
      >
        {inner}
      </a>
    );
  }
  return <div className={`${base} cursor-default opacity-60`}>{inner}</div>;
}
