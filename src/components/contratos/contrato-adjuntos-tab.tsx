"use client";

import * as React from "react";
import { Paperclip, Upload } from "lucide-react";

import { Button } from "@/components/ui/button";

type Props = {
  contractId: string;
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function ContractAdjuntosTab({ contractId: _contractId }: Props) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed bg-card py-10 text-center">
      <Paperclip className="h-6 w-6 text-muted-foreground/60" />
      <div className="space-y-1">
        <p className="text-sm font-medium">Adjuntos</p>
        <p className="text-xs text-muted-foreground">
          La integración con Supabase Storage se habilita más adelante. Por ahora
          puedes referenciar archivos desde notas internas.
        </p>
      </div>
      <Button variant="outline" size="sm" disabled>
        <Upload className="h-3.5 w-3.5" />
        Subir archivo (próximamente)
      </Button>
    </div>
  );
}
