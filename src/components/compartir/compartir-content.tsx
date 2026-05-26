"use client";

import * as React from "react";
import { Plug, Share2 } from "lucide-react";

import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ConnectClaudeTab } from "./connect-claude-tab";
import { ShareClientTab } from "./share-client-tab";
import type { McpTokenRow } from "@/lib/actions/mcp-tokens";
import type {
  ClientShareLinkRow,
  ClientPickerRow,
} from "@/lib/actions/client-shares";

type Props = {
  tokens: McpTokenRow[];
  shareLinks: ClientShareLinkRow[];
  clients: ClientPickerRow[];
  siteUrl: string;
};

export function CompartirContent({ tokens, shareLinks, clients, siteUrl }: Props) {
  return (
    <Tabs defaultValue="claude" className="space-y-6">
      <TabsList variant="line">
        <TabsTrigger value="claude">
          <Plug className="h-4 w-4" data-icon="inline-start" />
          Conectar con Claude
        </TabsTrigger>
        <TabsTrigger value="client">
          <Share2 className="h-4 w-4" data-icon="inline-start" />
          Compartir cliente
        </TabsTrigger>
      </TabsList>

      <TabsContent value="claude" className="space-y-6">
        <ConnectClaudeTab tokens={tokens} siteUrl={siteUrl} />
      </TabsContent>

      <TabsContent value="client" className="space-y-6">
        <ShareClientTab shareLinks={shareLinks} clients={clients} siteUrl={siteUrl} />
      </TabsContent>
    </Tabs>
  );
}
