"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

import { ContractConditionFilter } from "@/components/contratos/contract-condition-filter";
import {
  serializeContractConditions,
  type ContractCondition,
} from "@/lib/contract-condition";

interface Props {
  selected: Set<ContractCondition>;
  size?: "sm" | "md";
}

/**
 * Wrapper URL-driven sobre ContractConditionFilter para usar en /kam y /kam/[id].
 * Sincroniza con `?conditions=venta,muestra` en la URL.
 */
export function KamConditionFilter({ selected, size }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const onChange = (next: Set<ContractCondition>) => {
    const sp = new URLSearchParams(params.toString());
    const serialized = serializeContractConditions(next);
    if (serialized === undefined) sp.delete("conditions");
    else sp.set("conditions", serialized);
    const qs = sp.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  };

  return (
    <ContractConditionFilter
      selected={selected}
      onChange={onChange}
      size={size}
    />
  );
}
