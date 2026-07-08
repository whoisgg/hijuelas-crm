import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { docTypeMeta, type CommercialDocType } from "@/lib/contract-doc-type";

/**
 * Badge compacta para el tipo de documento comercial:
 * Contrato / OC / Spot.
 */
export function DocTypeBadge({
  docType,
  short = false,
}: {
  docType: CommercialDocType | string | null | undefined;
  short?: boolean;
}) {
  const meta = docTypeMeta(docType);
  return (
    <Badge variant="outline" className={cn("h-5", meta.className)}>
      {short ? meta.shortLabel : meta.label}
    </Badge>
  );
}
