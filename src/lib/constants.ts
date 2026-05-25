import type { LucideIcon } from "lucide-react";
import {
  LayoutDashboard,
  Users,
  FileText,
  Briefcase,
  Calendar,
  Sprout,
  BarChart3,
  Share2,
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
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    comingSoon: "Sprint 6",
  },
  {
    label: "Clientes",
    href: "/clientes",
    icon: Users,
    comingSoon: "Sprint 2",
  },
  {
    label: "Contratos",
    href: "/contratos",
    icon: FileText,
    comingSoon: "Sprint 3",
  },
  {
    label: "Oportunidades",
    href: "/oportunidades",
    icon: Briefcase,
    comingSoon: "Sprint 5",
  },
  {
    label: "KAM",
    href: "/kam",
    icon: UserCheck,
    comingSoon: "Sprint 7",
  },
  {
    label: "Calendario",
    href: "/calendario",
    icon: Calendar,
    comingSoon: "Sprint 6",
  },
  {
    label: "Catálogo",
    href: "/catalogo",
    icon: Sprout,
    comingSoon: "Sprint 1",
  },
  {
    label: "Reportes",
    href: "/reportes",
    icon: BarChart3,
    comingSoon: "Sprint 6",
  },
  {
    label: "Compartir",
    href: "/compartir",
    icon: Share2,
    comingSoon: "Sprint 7",
  },
];

export type QuickCreateItem = {
  label: string;
  href: string;
  shortcut?: string;
};

export const QUICK_CREATE_ITEMS: QuickCreateItem[] = [
  { label: "Cliente", href: "/clientes/nuevo", shortcut: "n c" },
  { label: "Contrato", href: "/contratos/nuevo", shortcut: "n k" },
  { label: "Oportunidad", href: "/oportunidades/nueva", shortcut: "n o" },
  { label: "Actividad", href: "/actividades/nueva", shortcut: "n t" },
];
