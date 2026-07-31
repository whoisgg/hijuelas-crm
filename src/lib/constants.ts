import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
  Database,
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
  Package,
  Settings,
  Shield,
  SprayCan,
  Warehouse,
  Sprout,
  Share2,
  TrendingUp,
  UserCheck,
} from "lucide-react";

export const APP_NAME = "Hijuelas One";
export const APP_DESCRIPTION =
  "Plataforma integral de Grupo Hijuelas — comercial y operaciones agrícolas.";

export type NavModule = "comercial" | "produccion" | "bodega";

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
  { label: "Datos maestros", href: "/planner/maestros", icon: Database, module: "produccion" },
  { label: "Resumen", href: "/bodega", icon: LayoutDashboard, module: "bodega" },
  { label: "Productos", href: "/bodega/productos", icon: Package, module: "bodega" },
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
    key: "bodega",
    label: "Bodega e Insumos",
    description: "Inventario de insumos, ingresos y salidas, stock por bodega.",
    icon: Warehouse,
    group: "agricola",
    status: "live",
    href: "/bodega",
    roles: ["admin", "produccion"],
    navModule: "bodega",
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

/* -------------------------------------------------------------------------- */
/* Acceso multi-módulo: niveles estándar + rol propio de cada módulo.         */
/* La fuente de verdad es la tabla module_access (ver lib/access.ts).         */
/* -------------------------------------------------------------------------- */

export type AccessLevel = "admin" | "editor" | "viewer";

export const ACCESS_LEVEL_RANK: Record<AccessLevel, number> = {
  viewer: 0,
  editor: 1,
  admin: 2,
};

export const ACCESS_LEVEL_OPTIONS: { value: AccessLevel; label: string }[] = [
  { value: "admin", label: "Admin del módulo" },
  { value: "editor", label: "Editor" },
  { value: "viewer", label: "Viewer" },
];

/**
 * Roles propios de cada módulo — la "función" del usuario dentro del módulo,
 * separada del nivel de acceso. Cada módulo define los suyos.
 */
export const MODULE_ROLE_OPTIONS: Record<string, { value: string; label: string }[]> = {
  crm: [
    { value: "kam", label: "KAM" },
    { value: "soporte", label: "Soporte comercial" },
    { value: "finanzas", label: "Finanzas" },
  ],
  bodega: [
    { value: "gerente", label: "Gerente" },
    { value: "almacenista", label: "Almacenista" },
    { value: "solicitante", label: "Solicitante" },
  ],
};

/** Lo que la UI necesita saber del acceso del usuario (serializable). */
export type ModuleAccessInfo = {
  isPlatformAdmin: boolean;
  modules: Record<string, { level: AccessLevel; moduleRole: string | null }>;
};

/** ¿El usuario ve este módulo en selector/switcher? */
export function accessCanSeeModule(
  access: ModuleAccessInfo | null,
  m: AppModule,
): boolean {
  if (access?.isPlatformAdmin) return true;
  if (m.key === "admin") return false; // Administración: solo platform admin
  if (m.status === "soon") {
    // Los "próximamente" se muestran a quien ya tiene un módulo del grupo.
    return MODULES.some(
      (x) =>
        x.group === m.group && x.status !== "soon" && !!access?.modules[x.key],
    );
  }
  return !!access?.modules[m.key];
}

/** Módulos visibles para el acceso (todos los estados). */
export function modulesForAccess(access: ModuleAccessInfo | null): AppModule[] {
  return MODULES.filter((m) => accessCanSeeModule(access, m));
}

/** Módulos nativos "live" — para el switcher de apps. */
export function liveModulesForAccess(access: ModuleAccessInfo | null): AppModule[] {
  return modulesForAccess(access).filter((m) => m.status === "live");
}

/** Módulos de nav internos (sidebar/bottom-nav) según acceso. */
export function navModulesForAccess(access: ModuleAccessInfo | null): NavModule[] {
  if (access?.isPlatformAdmin) return ["comercial", "produccion", "bodega"];
  const out: NavModule[] = [];
  if (access?.modules["crm"]) out.push("comercial");
  if (access?.modules["planner"]) out.push("produccion");
  if (access?.modules["bodega"]) out.push("bodega");
  // Fallback histórico: sin filas de acceso, comportamiento CRM.
  return out.length ? out : ["comercial"];
}

/** App activa según la URL: /planner es producción, /bodega es bodega. */
export function moduleForPathname(pathname: string): NavModule {
  if (pathname.startsWith("/planner")) return "produccion";
  if (pathname.startsWith("/bodega")) return "bodega";
  return "comercial";
}

/**
 * Ítems de nav para la app activa (por pathname), acotados a lo que el
 * acceso permite ver.
 */
export function navItemsFor(
  access: ModuleAccessInfo | null,
  pathname: string,
): NavItem[] {
  const allowed = navModulesForAccess(access);
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
