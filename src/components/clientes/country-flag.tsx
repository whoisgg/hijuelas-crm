import { cn } from "@/lib/utils";

/**
 * Emoji flag a partir de un código ISO-2 (e.g. "CL" → 🇨🇱).
 *
 * NOTA: Windows no renderiza glyphs de banderas regionales en Segoe UI Emoji
 * (decisión de Microsoft) — aparecen como las dos letras ("AR" en vez de 🇦🇷).
 * Por eso `<CountryFlag>` usa imágenes SVG, no emoji. Este helper se mantiene
 * para casos donde un emoji puro es suficiente (toasts, text-only labels en
 * otros OS).
 */
export function countryFlagEmoji(iso2: string | null | undefined): string {
  if (!iso2 || iso2.length !== 2) return "";
  const codePoints = iso2
    .toUpperCase()
    .split("")
    .map((c) => 127397 + c.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}

type CountryFlagSize = "xs" | "sm" | "md" | "lg";

type CountryFlagProps = {
  iso2?: string | null;
  name?: string | null;
  className?: string;
  showName?: boolean;
  size?: CountryFlagSize;
};

const SIZE_MAP: Record<CountryFlagSize, { w: number; h: number; src: string }> = {
  xs: { w: 14, h: 10, src: "w20" },
  sm: { w: 18, h: 13, src: "w40" },
  md: { w: 22, h: 16, src: "w40" },
  lg: { w: 28, h: 21, src: "w80" },
};

/**
 * Bandera de país renderizada como imagen SVG (vía flagcdn.com) para que se
 * vea consistente en Windows / Linux / macOS / mobile. Cae al nombre del país
 * si el ISO es inválido. La imagen carga lazy.
 */
export function CountryFlag({
  iso2,
  name,
  className,
  showName = true,
  size = "sm",
}: CountryFlagProps) {
  const sizing = SIZE_MAP[size];
  const code = (iso2 ?? "").trim().toLowerCase();
  const hasFlag = /^[a-z]{2}$/.test(code);

  if (!hasFlag && !name) return <span className="text-muted-foreground">—</span>;

  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {hasFlag ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`https://flagcdn.com/${sizing.src}/${code}.png`}
          srcSet={`https://flagcdn.com/w80/${code}.png 2x, https://flagcdn.com/w160/${code}.png 3x`}
          alt={name ? `${name}` : code.toUpperCase()}
          width={sizing.w}
          height={sizing.h}
          loading="lazy"
          decoding="async"
          className="inline-block shrink-0 rounded-[2px] object-cover ring-1 ring-black/10 dark:ring-white/10"
        />
      ) : null}
      {showName && name ? <span className="truncate">{name}</span> : null}
    </span>
  );
}
