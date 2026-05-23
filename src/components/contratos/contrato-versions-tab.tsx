"use client";

import * as React from "react";
import { FileText } from "lucide-react";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/components/contratos/format";
import type { ContractVersion } from "@/components/contratos/types";

type Props = {
  versions: ContractVersion[];
};

export function ContractVersionsTab({ versions }: Props) {
  if (versions.length === 0) {
    return (
      <div className="rounded-lg border bg-card py-10 text-center text-sm text-muted-foreground">
        Sin versiones congeladas. Se crea una versión al firmar el contrato.
      </div>
    );
  }
  const sorted = [...versions].sort((a, b) => b.version_n - a.version_n);
  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Versión</TableHead>
            <TableHead>Congelada</TableHead>
            <TableHead>PDF</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((v) => (
            <TableRow key={v.id}>
              <TableCell className="font-mono">v{v.version_n}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(v.frozen_at)}
              </TableCell>
              <TableCell>
                {v.pdf_url ? (
                  <a
                    href={v.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-primary hover:underline"
                  >
                    <FileText className="h-3.5 w-3.5" />
                    Ver PDF
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
