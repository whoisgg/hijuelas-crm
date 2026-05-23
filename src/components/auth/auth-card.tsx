import { cn } from "@/lib/utils";

interface AuthCardProps {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative overflow-hidden rounded-3xl border border-border/60 bg-card/70 p-6 shadow-xl shadow-black/5 backdrop-blur-xl sm:p-8 dark:bg-card/40 dark:shadow-black/20",
          className,
        )}
      >
        <div className="space-y-1.5">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">
            {title}
          </h1>
          {description ? (
            <p className="text-[14px] leading-relaxed text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        <div className="mt-6">{children}</div>
      </div>
      {footer ? (
        <div className="text-center text-[13px] text-muted-foreground">
          {footer}
        </div>
      ) : null}
    </div>
  );
}

/** 60px touch target field group — Apple/iOS spec */
export function AuthField({
  label,
  htmlFor,
  trailing,
  children,
}: {
  label: string;
  htmlFor: string;
  trailing?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label
          htmlFor={htmlFor}
          className="text-[13px] font-medium text-foreground/80"
        >
          {label}
        </label>
        {trailing}
      </div>
      {children}
    </div>
  );
}
