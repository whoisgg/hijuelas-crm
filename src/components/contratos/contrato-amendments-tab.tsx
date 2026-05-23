"use client";

import * as React from "react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { AMENDMENT_TYPE_LABEL } from "@/components/contratos/status-badge";
import { formatDate } from "@/components/contratos/format";
import type { ContractAmendment } from "@/components/contratos/types";

type Props = {
  amendments: ContractAmendment[];
};

export function ContractAmendmentsTab({ amendments }: Props) {
  if (amendments.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
        Sin modificaciones registradas.
      </div>
    );
  }
  const sorted = [...amendments].sort(
    (a, b) => new Date(b.applied_at).getTime() - new Date(a.applied_at).getTime(),
  );

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Fecha</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Motivo</TableHead>
            <TableHead>Detalle</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {formatDate(a.applied_at)}
              </TableCell>
              <TableCell>
                <Badge variant="outline">{AMENDMENT_TYPE_LABEL[a.type]}</Badge>
              </TableCell>
              <TableCell className="max-w-xs">
                <p className="truncate">{a.reason ?? "—"}</p>
              </TableCell>
              <TableCell>
                <pre className="max-w-md overflow-x-auto rounded-md bg-muted/40 p-1.5 font-mono text-[10px] text-muted-foreground">
                  {JSON.stringify(a.diff_json, null, 2)}
                </pre>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
