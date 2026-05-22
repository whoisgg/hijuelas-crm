import type { LucideIcon } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type StubPageProps = {
  title: string;
  description: string;
  sprint: string;
  icon: LucideIcon;
  bullets?: string[];
};

export function StubPage({
  title,
  description,
  sprint,
  icon: Icon,
  bullets,
}: StubPageProps) {
  return (
    <AppShell>
      <PageHeader title={title} description={description} badge={sprint} />
      <Card className="max-w-2xl">
        <CardHeader className="flex flex-row items-start gap-3 space-y-0">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div className="space-y-1">
            <CardTitle>Próximamente — {sprint}</CardTitle>
            <CardDescription>
              Esta vista todavía no se implementa. Es parte del roadmap definido
              en el Master Plan del CRM.
            </CardDescription>
          </div>
        </CardHeader>
        {bullets && bullets.length > 0 ? (
          <CardContent>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted-foreground">
              {bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          </CardContent>
        ) : null}
      </Card>
    </AppShell>
  );
}
