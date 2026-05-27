import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Calendar,
  Sprout,
  Share2,
  TrendingUp,
  UserCheck,
} from "lucide-react";

export const APP_NAME = "Hijuelas Growth";
export const APP_DESCRIPTION =
  "Plataforma comercial de Viveros Hijuelas — contratos, oportunidades y growth.";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: string;
};

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Calendario", href: "/calendario", icon: Calendar },
  { label: "Oportunidades", href: "/oportunidades", icon: Briefcase },
  { label: "Contratos", href: "/contratos", icon: FileText },
  { label: "Forecast", href: "/forecast", icon: TrendingUp },
  { label: "KAM", href: "/kam", icon: UserCheck },
  { label: "Clientes", href: "/clientes", icon: Users },
  { label: "Catálogo", href: "/catalogo", icon: Sprout },
  { label: "Compartir", href: "/compartir", icon: Share2 },
];

export type QuickCreateItem = {
  label: string;
  href: string;
  shortcut?: string;
};

export const QUICK_CREATE_ITEMS: QuickCreateItem[] = [
  { label: "Cliente", href: "/clientes/nuevo" },
  { label: "Contrato", href: "/contratos/nuevo" },
  { label: "Oportunidad", href: "/oportunidades/nueva" },
];
