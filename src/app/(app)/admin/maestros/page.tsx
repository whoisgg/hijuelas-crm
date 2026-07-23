import { redirect } from "next/navigation";
import { Building2, Dna, Plug, Shield, Sprout } from "lucide-react";

import { createClient } from "@/lib/supabase/server";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import {
  SettingsBack,
  SettingsRow,
  SettingsSection,
} from "@/components/design-system/settings-menu";
import {
  MastersEditor,
  type MasterProgramOption,
  type MasterSpeciesRow,
} from "@/components/admin/masters-editor";
import {
  ProgramsEditor,
  type MasterProgramRow,
} from "@/components/admin/programs-editor";
import { ConnectClaudeTab } from "@/components/compartir/connect-claude-tab";
import { listMcpTokens } from "@/lib/actions/mcp-tokens";

export const metadata = { title: "Datos maestros" };
export const dynamic = "force-dynamic";

const SECTIONS = ["catalogo", "programas", "mcp"] as const;
type SectionKey = (typeof SECTIONS)[number];

function resolveSiteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "http://localhost:3000"
  );
}

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
    .select("role, is_platform_admin")
    .eq("id", user.id)
    .maybeSingle();
  if (appUser?.role !== "admin" && !appUser?.is_platform_admin) redirect("/apps");

  const sp = await searchParams;
  const section: SectionKey | null =
    (SECTIONS.find((s) => s === sp.tab) as SectionKey | undefined) ?? null;

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

  const varietiesTotal = varietiesRes.data?.length ?? 0;

  // ── Índice (menú de selección, mismo patrón de Kisei) ──
  if (!section) {
    return (
      <AppShell>
        <PageHeader
          title="Datos maestros"
          description="Catálogos compartidos por todas las apps de Hijuelas One. El CRM y el Planner leen de aquí."
        />
        <div className="mx-auto mt-6 w-full max-w-2xl">
          <SettingsSection title="Catálogos">
            <SettingsRow
              href="/admin/maestros?tab=catalogo"
              icon={Sprout}
              iconClass="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              label="Especies y variedades"
              sub="Catálogo compartido, con programa genético por variedad"
              right={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {species.length} · {varietiesTotal}
                </span>
              }
            />
            <SettingsRow
              href="/admin/maestros?tab=programas"
              icon={Dna}
              iconClass="bg-violet-500/10 text-violet-600 dark:text-violet-400"
              label="Programas genéticos"
              sub="Titulares de las variedades + re-vinculación del Planner"
              right={
                <span className="text-xs tabular-nums text-muted-foreground">
                  {programs.length}
                </span>
              }
            />
          </SettingsSection>

          <SettingsSection title="Plataforma">
            <SettingsRow
              href="/admin/usuarios"
              icon={Shield}
              iconClass="bg-blue-500/10 text-blue-600 dark:text-blue-400"
              label="Usuarios"
              sub="Cuentas, roles y accesos de Hijuelas One"
            />
            <SettingsRow
              href="/admin/organizaciones"
              icon={Building2}
              iconClass="bg-amber-500/10 text-amber-600 dark:text-amber-400"
              label="Organizaciones"
              sub="Razones sociales y datos legales para contratos"
            />
            <SettingsRow
              href="/admin/maestros?tab=mcp"
              icon={Plug}
              iconClass="bg-sky-500/10 text-sky-600 dark:text-sky-400"
              label="Conectar con Claude"
              sub="Tokens MCP — CRM y Planner consultables desde Claude"
            />
          </SettingsSection>
        </div>
      </AppShell>
    );
  }

  // ── Subsección con volver ──
  const SECTION_META: Record<SectionKey, { title: string; description: string }> = {
    catalogo: {
      title: "Especies y variedades",
      description:
        "Catálogo compartido por todas las apps; el programa genético se asigna por variedad.",
    },
    programas: {
      title: "Programas genéticos",
      description:
        "Titulares de las variedades. «Re-vincular planner» cruza los catálogos del Planner con estos maestros.",
    },
    mcp: {
      title: "Conectar con Claude",
      description:
        "Tokens del servidor MCP de Hijuelas One — da acceso de consulta al CRM (clientes, contratos, forecast) y al Planner (ocupación, alertas, lotes, salidas) desde Claude.",
    },
  };

  const tokens = section === "mcp" ? await listMcpTokens() : [];

  return (
    <AppShell>
      <PageHeader
        title={SECTION_META[section].title}
        description={SECTION_META[section].description}
        actions={<SettingsBack href="/admin/maestros" label="Datos maestros" />}
      />
      <div className="mt-4">
        {section === "catalogo" ? (
          <MastersEditor species={species} programs={programOptions} />
        ) : null}
        {section === "programas" ? <ProgramsEditor programs={programs} /> : null}
        {section === "mcp" ? (
          <div className="space-y-6">
            <ConnectClaudeTab tokens={tokens} siteUrl={resolveSiteUrl()} />
          </div>
        ) : null}
      </div>
    </AppShell>
  );
}
