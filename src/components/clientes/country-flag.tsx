import { cn } from "@/lib/utils";

/**
 * Emoji flag a partir de un código ISO-2 (e.g. "CL" → 🇨🇱).
 * Se renderiza vacío si el código es inválido o falta.
 */
export function countryFlagEmoji(iso2: string | null | undefined): string {
  if (!iso2 || iso2.length !== 2) return "";
  const codePoints = iso2
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

type CountryFlagProps = {
  iso2?: string | null;
  name?: string | null;
  className?: string;
  showName?: boolean;
};

export function CountryFlag({
  iso2,
  name,
  className,
  showName = true,
}: CountryFlagProps) {
  const flag = countryFlagEmoji(iso2);
  if (!flag && !name) return <span className="text-muted-foreground">—</span>;
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {flag ? (
        <span aria-hidden className="text-base leading-none">
          {flag}
        </span>
      ) : null}
      {showName && name ? <span className="truncate">{name}</span> : null}
    </span>
  );
}
