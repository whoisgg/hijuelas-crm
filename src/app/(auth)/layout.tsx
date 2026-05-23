import { Sprout } from "lucide-react";
import { APP_NAME } from "@/lib/constants";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background">
      {/* Ambient gradient background */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
      >
        <div className="absolute -top-40 left-1/2 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-primary/25 blur-[140px] dark:bg-primary/20" />
        <div className="absolute top-1/3 -right-32 h-96 w-96 rounded-full bg-emerald-400/20 blur-[120px] dark:bg-emerald-500/10" />
        <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-lime-300/20 blur-[120px] dark:bg-lime-500/10" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,var(--background)_75%)]" />
      </div>

      {/* Brand mark */}
      <header className="flex items-center gap-2.5 px-6 py-6 sm:px-10">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm shadow-primary/30">
          <Sprout className="h-4.5 w-4.5" strokeWidth={2.25} />
        </div>
        <span className="text-[15px] font-semibold tracking-tight">
          {APP_NAME}
        </span>
      </header>

      {/* Form area */}
      <main className="flex flex-1 items-center justify-center px-4 pb-12 sm:px-6">
        <div className="w-full max-w-[420px]">{children}</div>
      </main>

      {/* Footer */}
      <footer className="px-6 pb-6 text-center text-[11px] text-muted-foreground/70 sm:px-10">
        © {new Date().getFullYear()} Viveros Hijuelas · CRM interno
      </footer>
    </div>
  );
}
