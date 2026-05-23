"use client";

import * as React from "react";

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ContractItemsTab } from "@/components/contratos/contrato-items-tab";
import { ContractPagosTab } from "@/components/contratos/contrato-pagos-tab";
import { ContractEntregasTab } from "@/components/contratos/contrato-entregas-tab";
import { ContractAmendmentsTab } from "@/components/contratos/contrato-amendments-tab";
import { ContractVersionsTab } from "@/components/contratos/contrato-versions-tab";
import { ContractAdjuntosTab } from "@/components/contratos/contrato-adjuntos-tab";
import type {
  ContractItemRow,
  ContractPayment,
  ContractAmendment,
  ContractVersion,
} from "@/components/contratos/types";

type Props = {
  contractId: string;
  items: ContractItemRow[];
  payments: ContractPayment[];
  amendments: ContractAmendment[];
  versions: ContractVersion[];
  varieties: { id: string; name: string }[];
};

type TabId = "items" | "pagos" | "entregas" | "amendments" | "versiones" | "adjuntos";

export function ContratoTabs({
  contractId,
  items,
  payments,
  amendments,
  versions,
  varieties,
}: Props) {
  const [tab, setTab] = React.useState<TabId>("items");

  return (
    <Tabs
      value={tab}
      onValueChange={(v) => v && setTab(v as TabId)}
      className="flex flex-col gap-3"
    >
      <TabsList variant="line" className="border-b">
        <TabsTrigger value="items">
          Items
          <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
            {items.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="pagos">
          Pagos
          <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
            {payments.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="entregas">Entregas</TabsTrigger>
        <TabsTrigger value="amendments">
          Amendments
          <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
            {amendments.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="versiones">
          Versiones
          <Badge variant="secondary" className="ml-1.5 h-4 px-1.5 text-[10px]">
            {versions.length}
          </Badge>
        </TabsTrigger>
        <TabsTrigger value="adjuntos">Adjuntos</TabsTrigger>
      </TabsList>

      <TabsContent value="items">
        <ContractItemsTab
          contractId={contractId}
          items={items}
          varieties={varieties}
        />
      </TabsContent>
      <TabsContent value="pagos">
        <ContractPagosTab payments={payments} />
      </TabsContent>
      <TabsContent value="entregas">
        <ContractEntregasTab contractId={contractId} items={items} />
      </TabsContent>
      <TabsContent value="amendments">
        <ContractAmendmentsTab amendments={amendments} />
      </TabsContent>
      <TabsContent value="versiones">
        <ContractVersionsTab versions={versions} />
      </TabsContent>
      <TabsContent value="adjuntos">
        <ContractAdjuntosTab contractId={contractId} />
      </TabsContent>
    </Tabs>
  );
}
