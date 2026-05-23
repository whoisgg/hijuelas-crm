import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  conditionMeta,
  type ContractCondition,
} from "@/lib/contract-condition";

/**
 * Badge compacta para mostrar la condición comercial del contrato:
 * Venta / Muestra / Reposición.
 */
export function ContractConditionBadge({
  condition,
}: {
  condition: ContractCondition | string | null | undefined;
}) {
  const meta = conditionMeta(condition);
  return (
    <Badge variant="outline" className={cn("h-5", meta.className)}>
      {meta.label}
    </Badge>
  );
}
