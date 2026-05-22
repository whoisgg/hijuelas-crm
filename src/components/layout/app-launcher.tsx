"use client";

import * as React from "react";
import Link from "next/link";
import { LayoutGrid } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { NAV_ITEMS } from "@/lib/constants";

export function AppLauncher() {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="Abrir lanzador de aplicaciones"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Módulos</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-3 gap-3 pt-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex flex-col items-center justify-center gap-2 rounded-lg border bg-card p-4 text-center text-sm transition-colors hover:bg-accent"
              >
                <Icon className="h-6 w-6 text-primary" />
                <span className="font-medium">{item.label}</span>
              </Link>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
