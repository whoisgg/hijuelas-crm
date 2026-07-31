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
  Flower2,
  Layers,
  Package,
  PackageCheck,
  Wheat,
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
export type ModuleGroup =
  | "comercial"
  | "vivero"
  | "agricola"
  | "recursos"
  | "plataforma";
export type ModuleStatus = "live" | "soon" | "external";

/**
 * Unidad de negocio. Riego, Fitosanitario y Mano de Obra son UN módulo cada
 * uno pero se trabajan distinto en el vivero que en el campo, así que el
 * contexto es una dimensión del módulo (una card por contexto en el selector,
 * `?ctx=` en la ruta, switcher adentro) y no un módulo duplicado: un permiso,
 * un código, dos vistas.
 *
 * OJO: el contexto define QUÉ VISTA, no QUÉ DATOS. El alcance de datos (país,
 * sitio, sucursal) es otra dimensión, con consolidado y filtro en la base —
 * no se mezcla acá. Acotar contextos por usuario está pendiente: hoy
 * `module_access` solo guarda level y module_role.
 */
export type AppContext = "vivero" | "agricola";

export const CONTEXT_LABELS: Record<AppContext, string> = {
  vivero: "Vivero",
  agricola: "Agrícola",
};

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
  /** unidades de negocio en las que se usa; el selector lo muestra en el
   *  grupo de cada una. Sin esto, el módulo vive solo en su `group`. */
  contexts?: AppContext[];
};

export const MODULE_GROUPS: { key: ModuleGroup; label: string }[] = [
  { key: "comercial", label: "Comercial" },
  { key: "vivero", label: "Vivero" },
  { key: "agricola", label: "Agrícola" },
  { key: "recursos", label: "Recursos" },
  { key: "plataforma", label: "Plataforma" },
];

/** Grupos de operación — los "próximamente" se muestran a quien ya trabaja en
 *  alguno de ellos, no a un usuario solo comercial. */
const OPERATIONAL_GROUPS: ModuleGroup[] = ["vivero", "agricola", "recursos"];

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
    group: "vivero",
    status: "live",
    href: "/planner",
    roles: ["admin", "produccion"],
    navModule: "produccion",
  },
  {
    key: "floracion",
    label: "Floración",
    description: "Seguimiento de floración y cuaja por cuartel.",
    icon: Flower2,
    group: "agricola",
    status: "soon",
    roles: ["admin", "produccion"],
  },
  {
    key: "cosecha",
    label: "Cosecha",
    description: "Órdenes de cosecha, avance diario y rendimiento por cuartel.",
    icon: Wheat,
    group: "agricola",
    status: "soon",
    roles: ["admin", "produccion"],
  },
  {
    key: "postcosecha",
    label: "Postcosecha",
    description: "Recepción, proceso, calidad y despacho.",
    icon: PackageCheck,
    group: "agricola",
    status: "soon",
    roles: ["admin", "produccion"],
  },
  {
    key: "riego",
    label: "Riego",
    description: "Programación y órdenes de riego por cuartel.",
    icon: Droplets,
    group: "recursos",
    contexts: ["vivero", "agricola"],
    status: "soon",
    roles: ["admin", "produccion"],
  },
  {
    key: "mano_obra",
    label: "Mano de Obra",
    description: "Asistencia, dotación, asignación a labores y centros de costo.",
    icon: Users,
    group: "recursos",
    contexts: ["vivero", "agricola"],
    status: "soon",
    roles: ["admin", "produccion"],
  },
  {
    key: "fitosanitario",
    label: "Fitosanitario",
    description: "Aplicaciones, fertilización, carencias y registro SAG.",
    icon: SprayCan,
    group: "recursos",
    contexts: ["vivero", "agricola"],
    status: "soon",
    roles: ["admin", "produccion"],
  },
  {
    key: "bodega",
    label: "Bodega e Insumos",
    description: "Inventario de insumos, ingresos y salidas, stock por bodega.",
    icon: Warehouse,
    // Recurso sin contexto: la bodega es la misma para vivero y campo; lo que
    // la parte es la sucursal/bodega, no la unidad de negocio.
    group: "recursos",
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
    // Los "próximamente" son un teaser sin datos: se muestran a quien ya
    // trabaja en operaciones, no a un usuario solo comercial.
    return MODULES.some(
      (x) =>
        x.status === "live" &&
        OPERATIONAL_GROUPS.includes(x.group) &&
        !!access?.modules[x.key],
    );
  }
  return !!access?.modules[m.key];
}

/**
 * Módulos que le tocan a un grupo del selector. Un módulo con `contexts` se
 * muestra en el grupo de CADA contexto (Riego aparece en Vivero y en
 * Agrícola), no en Recursos — ahí solo quedan los que no se parten por unidad
 * de negocio, como Bodega.
 */
export function modulesForGroup(
  modules: AppModule[],
  group: ModuleGroup,
): AppModule[] {
  if (group === "vivero" || group === "agricola") {
    return modules.filter(
      (m) => m.group === group || m.contexts?.includes(group),
    );
  }
  return modules.filter((m) => m.group === group && !m.contexts?.length);
}

/** Ruta del módulo dentro de un grupo: los que tienen contexto lo llevan. */
export function moduleHref(m: AppModule, group: ModuleGroup): string | undefined {
  if (!m.href) return undefined;
  const ctx = m.contexts?.find((c) => c === group);
  return ctx ? `${m.href}?ctx=${ctx}` : m.href;
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
