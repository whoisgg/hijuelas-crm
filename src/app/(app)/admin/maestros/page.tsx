import Link from "next/link";
import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  MastersEditor,
  type MasterProgramOption,
  type MasterSpeciesRow,
} from "@/components/admin/masters-editor";
import {
  ProgramsEditor,
  type MasterProgramRow,
} from "@/components/admin/programs-editor";

export const metadata = { title: "Datos maestros" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "catalogo", label: "Especies y variedades" },
  { key: "programas", label: "Programas genéticos" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function AdminMaestrosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
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
  if (appUser?.role !== "admin") redirect("/dashboard");

  const sp = await searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "catalogo") as TabKey;

  const [speciesRes, varietiesRes, programsRes] = await Promise.all([
    supabase
      .from("species")
      .select("id, name, code")
      .is("deleted_at", null)
      .order("name"),
    supabase
      .from("varieties")
      .select("id, name, species_id, genetic_program_id, is_active")
      .is("deleted_at", null)
      .order("name")
      .limit(2000),
    supabase
      .from("genetic_programs")
      .select("id, name, owner")
      .is("deleted_at", null)
      .order("name"),
  ]);

  const programName = new Map((programsRes.data ?? []).map((p) => [p.id, p.name]));
  const varietiesBySpecies = new Map<string, MasterSpeciesRow["varieties"]>();
  const varietyCountByProgram = new Map<string, number>();
  for (const v of varietiesRes.data ?? []) {
    const arr = varietiesBySpecies.get(v.species_id) ?? [];
    arr.push({
      id: v.id,
      name: v.name,
      programId: v.genetic_program_id,
      programName: v.genetic_program_id
        ? (programName.get(v.genetic_program_id) ?? null)
        : null,
      isActive: v.is_active,
    });
    varietiesBySpecies.set(v.species_id, arr);
    if (v.genetic_program_id) {
      varietyCountByProgram.set(
        v.genetic_program_id,
        (varietyCountByProgram.get(v.genetic_program_id) ?? 0) + 1,
      );
    }
  }

  const species: MasterSpeciesRow[] = (speciesRes.data ?? []).map((s) => ({
    id: s.id,
    name: s.name,
    code: s.code,
    varieties: varietiesBySpecies.get(s.id) ?? [],
  }));

  const programOptions: MasterProgramOption[] = (programsRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
  }));

  const programs: MasterProgramRow[] = (programsRes.data ?? []).map((p) => ({
    id: p.id,
    name: p.name,
    owner: p.owner,
    varietyCount: varietyCountByProgram.get(p.id) ?? 0,
  }));

  return (
    <AppShell>
      <PageHeader
        title="Datos maestros"
        description="Catálogos compartidos por todas las apps de Hijuelas One: especies, variedades y programas genéticos. El CRM y el Planner leen de aquí."
      />

      <div className="mt-4 flex flex-wrap gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/admin/maestros?tab=${t.key}`}
            className={cn(
              "rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              tab === t.key
                ? "border-foreground bg-foreground font-medium text-background"
                : "text-muted-foreground hover:border-foreground/40 hover:text-foreground",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      <div className="mt-4">
        {tab === "catalogo" ? (
          <MastersEditor species={species} programs={programOptions} />
        ) : (
          <ProgramsEditor programs={programs} />
        )}
      </div>
    </AppShell>
  );
}
