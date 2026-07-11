import type { LucideIcon } from "lucide-react";
import {
  ArrowRightLeft,
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
  Sprout,
  Share2,
  TrendingUp,
  UserCheck,
} from "lucide-react";

export const APP_NAME = "Grupo Hijuelas";
export const APP_DESCRIPTION =
  "Plataforma integral de Grupo Hijuelas — ventas, clientes y producción.";

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
];

/**
 * Apps de la suite. Flujo: login → /apps (selector) → cada app con su nav.
 */
export type AppDef = {
  key: NavModule;
  label: string;
  description: string;
  href: string;
  icon: LucideIcon;
};

export const APPS: AppDef[] = [
  {
    key: "comercial",
    label: "CRM",
    description: "Ventas, clientes, oportunidades y forecast.",
    href: "/dashboard",
    icon: Briefcase,
  },
  {
    key: "produccion",
    label: "Planner",
    description: "Planificación de producción del vivero.",
    href: "/planner",
    icon: CalendarRange,
  },
];

/**
 * Módulos (apps) disponibles según rol. `produccion` ve solo el Planner;
 * `admin` ve todo; el resto de los roles (sales, finance, viewer, …)
 * mantiene el comportamiento histórico: app comercial completa.
 */
export function navModulesForRole(role: string | null | undefined): NavModule[] {
  if (role === "admin") return ["comercial", "produccion"];
  if (role === "produccion") return ["produccion"];
  return ["comercial"];
}

export function appsForRole(role: string | null | undefined): AppDef[] {
  const modules = navModulesForRole(role);
  return APPS.filter((app) => modules.includes(app.key));
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
