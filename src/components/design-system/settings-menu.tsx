import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Menú de selección estilo iOS Settings (mismo patrón de Kisei GRC): filas
 * con ícono en cuadrado de color + label + subtítulo + chevron, agrupadas en
 * secciones. Se usa como índice de las vistas de datos maestros; cada fila
 * navega a su subsección y la subsección vuelve con <SettingsBack>.
 */

export function SettingsSection({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-6">
      {title ? (
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </h2>
      ) : null}
      <div className="divide-y divide-border/70 overflow-hidden rounded-xl border bg-card shadow-sm">
        {children}
      </div>
    </section>
  );
}

export function SettingsRow({
  href,
  icon: Icon,
  iconClass,
  label,
  sub,
  right,
}: {
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  /** clases de color del cuadrado del ícono, ej. "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" */
  iconClass: string;
  label: string;
  sub?: string;
  right?: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-muted/40"
    >
      <div
        className={cn(
          "grid size-9 shrink-0 place-items-center rounded-[10px]",
          iconClass,
        )}
      >
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium leading-tight">{label}</p>
        {sub ? (
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
        ) : null}
      </div>
      {right}
      <ChevronRight className="size-4 shrink-0 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-muted-foreground" />
    </Link>
  );
}

/** Volver al índice del menú desde una subsección. */
export function SettingsBack({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" /> {label}
    </Link>
  );
}
