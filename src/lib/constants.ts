import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Droplets,
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Calendar,
  CalendarClock,
  CalendarRange,
  FileUp,
  FlaskConical,
  Layers,
  Settings,
  Shield,
  SprayCan,
  Sprout,
  Share2,
  TrendingUp,
  UserCheck,
} from "lucide-react";

export const APP_NAME = "Hijuelas One";
export const APP_DESCRIPTION =
  "Plataforma integral de Grupo Hijuelas — comercial y operaciones agrícolas.";

export type NavModule = "comercial" | "produccion";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  module: NavModule;
  comingSoon?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard, module: "comercial" },
  { label: "Calendario", href: "/calendario", icon: Calendar, module: "comercial" },
  { label: "Oportunidades", href: "/oportunidades", icon: Briefcase, module: "comercial" },
  { label: "Ventas", href: "/contratos", icon: FileText, module: "comercial" },
  { label: "Forecast", href: "/forecast", icon: TrendingUp, module: "comercial" },
  { label: "KAM", href: "/kam", icon: UserCheck, module: "comercial" },
  { label: "Clientes", href: "/clientes", icon: Users, module: "comercial" },
  { label: "Catálogo", href: "/catalogo", icon: Sprout, module: "comercial" },
  { label: "Compartir", href: "/compartir", icon: Share2, module: "comercial" },
  { label: "Planner", href: "/planner", icon: CalendarRange, module: "produccion" },
  { label: "Ocupación", href: "/planner/ocupacion", icon: CalendarClock, module: "produccion" },
  { label: "Lotes", href: "/planner/lotes", icon: Layers, module: "produccion" },
  { label: "Movimientos", href: "/planner/movimientos", icon: ArrowRightLeft, module: "produccion" },
  { label: "Simulador", href: "/planner/simulador", icon: FlaskConical, module: "produccion" },
  { label: "Reporte", href: "/planner/reporte", icon: FileText, module: "produccion" },
  { label: "Carga", href: "/planner/carga", icon: FileUp, module: "produccion" },
  { label: "Ajustes", href: "/planner/ajustes", icon: Settings, module: "produccion" },
];

/**
 * Registro de módulos de la plataforma (tipo Odoo/SAP). Un módulo puede ser
 * nativo (ruta interna con su propia nav), un enlace externo (Jira, SAP,
 * Power BI) o estar "próximamente". El selector `/apps` y el switcher se
 * dibujan desde acá — agregar un módulo es una entrada más en esta lista.
 *
 * Flujo: login → /apps (selector) → módulo nativo con su nav, enlace externo
 * en pestaña nueva, o "próximamente" deshabilitado.
 */
export type ModuleGroup = "comercial" | "agricola" | "plataforma";
export type ModuleStatus = "live" | "soon" | "external";

export type AppModule = {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  group: ModuleGroup;
  status: ModuleStatus;
  /** ruta interna (status live) */
  href?: string;
  /** URL externa (status external) — abre en pestaña nueva */
  url?: string;
  /** roles que ven el módulo; "all" = cualquier autenticado. admin ve todo. */
  roles: string[] | "all";
  /** módulo de nav interno (para nativos con sidebar propio) */
  navModule?: NavModule;
};

export const MODULE_GROUPS: { key: ModuleGroup; label: string }[] = [
  { key: "comercial", label: "Comercial" },
  { key: "agricola", label: "Operaciones agrícolas" },
  { key: "plataforma", label: "Plataforma" },
];

// Maestros en dos niveles: los COMPARTIDOS (especies, variedades, programas,
// organizaciones, usuarios) viven en Administración a nivel plataforma; cada
// módulo mantiene sus maestros OPERACIONALES (ej. sectores y ficha de especie
// del Planner en /planner/ajustes) referenciando los ids compartidos.
export const MODULES: AppModule[] = [
  {
    key: "crm",
    label: "CRM",
    description: "Ventas, clientes, oportunidades y forecast.",
    icon: Briefcase,
    group: "comercial",
    status: "live",
    href: "/dashboard",
    roles: ["admin", "sales", "sales_support", "finance", "viewer", "mcp_editor"],
    navModule: "comercial",
  },
  {
    key: "planner",
    label: "Planner",
    description: "Planificación y ocupación del vivero.",
    icon: CalendarRange,
    group: "agricola",
    status: "live",
    href: "/planner",
    roles: ["admin", "produccion"],
    navModule: "produccion",
  },
  {
    key: "riego",
    label: "Riego",
    description: "Programación y órdenes de riego por cuartel.",
    icon: Droplets,
    group: "agricola",
    status: "soon",
    roles: ["admin", "produccion"],
  },
  {
    key: "mano_obra",
    label: "Mano de Obra",
    description: "Asistencia, dotación, asignación a labores y centros de costo.",
    icon: Users,
    group: "agricola",
    status: "soon",
    roles: ["admin", "produccion"],
  },
  {
    key: "fitosanitario",
    label: "Fitosanitario",
    description: "Aplicaciones, fertilización, carencias y registro SAG.",
    icon: SprayCan,
    group: "agricola",
    status: "soon",
    roles: ["admin", "produccion"],
  },
  {
    key: "admin",
    label: "Administración",
    description: "Usuarios, organizaciones y datos maestros compartidos.",
    icon: Shield,
    group: "plataforma",
    status: "live",
    href: "/admin/maestros",
    roles: ["admin"],
    navModule: "comercial",
  },
];

/**
 * Módulos de nav internos disponibles según rol. `produccion` ve solo el
 * Planner; `admin` ve todo; el resto de los roles mantiene el comportamiento
 * histórico: app comercial completa.
 */
export function navModulesForRole(role: string | null | undefined): NavModule[] {
  if (role === "admin") return ["comercial", "produccion"];
  if (role === "produccion") return ["produccion"];
  return ["comercial"];
}

/** ¿El rol ve este módulo? admin ve todo; "all" = cualquiera. */
export function roleCanSeeModule(
  role: string | null | undefined,
  m: AppModule,
): boolean {
  if (role === "admin") return true;
  if (m.roles === "all") return true;
  return !!role && m.roles.includes(role);
}

/** Módulos visibles para el rol (todos los estados). */
export function modulesForRole(role: string | null | undefined): AppModule[] {
  return MODULES.filter((m) => roleCanSeeModule(role, m));
}

/** Módulos nativos "live" — para el switcher de apps. */
export function liveModulesForRole(role: string | null | undefined): AppModule[] {
  return modulesForRole(role).filter((m) => m.status === "live");
}

/** App activa según la URL: todo lo que cuelga de /planner es producción. */
export function moduleForPathname(pathname: string): NavModule {
  return pathname.startsWith("/planner") ? "produccion" : "comercial";
}

/**
 * Ítems de nav para la app activa (por pathname), acotados a lo que el rol
 * puede ver.
 */
export function navItemsFor(
  role: string | null | undefined,
  pathname: string,
): NavItem[] {
  const allowed = navModulesForRole(role);
  const current = moduleForPathname(pathname);
  if (!allowed.includes(current)) return [];
  return NAV_ITEMS.filter((item) => item.module === current);
}

export type QuickCreateItem = {
  label: string;
  href: string;
  shortcut?: string;
};

export const QUICK_CREATE_ITEMS: QuickCreateItem[] = [
  { label: "Cliente", href: "/clientes/nuevo" },
  { label: "Venta", href: "/contratos/nuevo" },
  { label: "Oportunidad", href: "/oportunidades/nueva" },
];
