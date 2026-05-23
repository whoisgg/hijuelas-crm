"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { AlertCircle } from "lucide-react";
import { toast } from "sonner";

import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  markOpportunityLost,
  transitionOpportunityStage,
  updateOpportunity,
  type AppUserRow,
  type OpportunityStage,
  type OpportunityWithRelations,
} from "@/lib/actions/oportunidades";

import { LostReasonDialog } from "./lost-reason-dialog";
import { ConvertConfirmDialog } from "./convert-confirm-dialog";
import {
  daysBetween,
  formatCurrency,
  formatDate,
  initialsOf,
  isOverdue,
} from "./utils";

type Props = {
  rows: OpportunityWithRelations[];
  stages: OpportunityStage[];
  users: Pick<AppUserRow, "id" | "full_name" | "email" | "avatar_url">[];
};

export function OpportunityListView({ rows, stages, users }: Props) {
  const router = useRouter();
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [lostDialog, setLostDialog] = React.useState<{
    id: string;
    name: string;
  } | null>(null);
  const [convertDialog, setConvertDialog] = React.useState<{
    id: string;
    name: string;
  } | null>(null);

  const handleStageChange = async (
    opp: OpportunityWithRelations,
    toStageId: string,
  ) => {
    const stage = stages.find((s) => s.id === toStageId);
    if (!stage) return;
    if (stage.is_lost) {
      setLostDialog({ id: opp.id, name: opp.name });
      return;
    }
    if (stage.is_won) {
      setConvertDialog({ id: opp.id, name: opp.name });
      return;
    }
    try {
      await transitionOpportunityStage(opp.id, toStageId);
      toast.success(`Movido a ${stage.name}`);
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al cambiar de stage",
      );
    }
  };

  const handleOwnerChange = async (
    opp: OpportunityWithRelations,
    ownerId: string,
  ) => {
    try {
      await updateOpportunity(opp.id, { owner_id: ownerId || null });
      toast.success("Owner actualizado");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al cambiar owner",
      );
    }
  };

  const handleProbabilityChange = async (
    opp: OpportunityWithRelations,
    value: number,
  ) => {
    try {
      await updateOpportunity(opp.id, { probability_pct: value });
      toast.success("Probabilidad actualizada");
      router.refresh();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Error al actualizar probabilidad",
      );
    }
  };

  const columns = React.useMemo<ColumnDef<OpportunityWithRelations>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Nombre",
        cell: ({ row }) => (
          <Link
            href={`/oportunidades/${row.original.id}`}
            className="font-medium text-foreground hover:underline"
          >
            {row.original.name}
          </Link>
        ),
      },
      {
        id: "client",
        header: "Cliente",
        accessorFn: (r) => r.client?.name ?? r.client_name_raw ?? "",
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {row.original.client?.name ??
              row.original.client_name_raw ??
              "—"}
          </span>
        ),
      },
      {
        id: "stage",
        header: "Stage",
        accessorFn: (r) => r.stage?.name ?? "",
        cell: ({ row }) => (
          <Select
            value={row.original.stage_id}
            onValueChange={(v) => {
              if (typeof v === "string") handleStageChange(row.original, v);
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-full max-w-[140px] text-xs"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {stages.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  <span
                    className="mr-1.5 inline-block size-2 rounded-full"
                    style={{ backgroundColor: s.color ?? "#94a3b8" }}
                  />
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
      {
        id: "owner",
        header: "Owner",
        accessorFn: (r) => r.owner?.full_name ?? "",
        cell: ({ row }) => (
          <Select
            value={row.original.owner_id ?? ""}
            onValueChange={(v) => {
              if (typeof v === "string") handleOwnerChange(row.original, v);
            }}
          >
            <SelectTrigger
              size="sm"
              className="h-7 w-full max-w-[160px] text-xs"
            >
              <SelectValue placeholder="Sin owner" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  <Avatar size="sm" className="size-4">
                    {u.avatar_url ? (
                      <AvatarImage src={u.avatar_url} alt={u.full_name ?? ""} />
                    ) : null}
                    <AvatarFallback className="text-[8px]">
                      {initialsOf(u.full_name ?? u.email ?? "")}
                    </AvatarFallback>
                  </Avatar>
                  {u.full_name ?? u.email ?? "—"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ),
      },
      {
        id: "probability",
        header: "Prob.",
        accessorFn: (r) => r.probability_pct,
        cell: ({ row }) => (
          <InlineProbability
            value={row.original.probability_pct}
            onChange={(v) => handleProbabilityChange(row.original, v)}
          />
        ),
      },
      {
        id: "estimated_value_usd",
        header: "Valor (USD)",
        accessorFn: (r) => r.estimated_value_usd ?? 0,
        cell: ({ row }) => (
          <span className="font-medium">
            {formatCurrency(row.original.estimated_value_usd, "USD")}
          </span>
        ),
      },
      {
        id: "expected_close_date",
        header: "Close esperado",
        accessorFn: (r) => r.expected_close_date ?? "",
        cell: ({ row }) => {
          const overdue = isOverdue(row.original.expected_close_date);
          return (
            <span className="inline-flex items-center gap-1">
              {formatDate(row.original.expected_close_date)}
              {overdue ? (
                <Badge
                  variant="destructive"
                  className="h-4 px-1 text-[9px]"
                >
                  <AlertCircle className="h-2.5 w-2.5" />
                  vencida
                </Badge>
              ) : null}
            </span>
          );
        },
      },
      {
        id: "days_in_stage",
        header: "Días en stage",
        accessorFn: (r) => daysBetween(r.updated_at),
        cell: ({ row }) => (
          <span className="text-muted-foreground">
            {daysBetween(row.original.updated_at)}d
          </span>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [stages, users],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <>
      <div className="rounded-xl border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((hg) => (
              <TableRow key={hg.id} className="bg-muted/30 hover:bg-muted/30">
                {hg.headers.map((header) => (
                  <TableHead
                    key={header.id}
                    onClick={header.column.getToggleSortingHandler()}
                    className={cn(
                      "h-9 text-xs",
                      header.column.getCanSort() && "cursor-pointer select-none",
                    )}
                  >
                    {flexRender(
                      header.column.columnDef.header,
                      header.getContext(),
                    )}
                    {header.column.getIsSorted() === "asc"
                      ? " ↑"
                      : header.column.getIsSorted() === "desc"
                        ? " ↓"
                        : ""}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="py-12 text-center text-xs text-muted-foreground"
                >
                  Sin oportunidades.
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id} className="py-1.5 text-xs">
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext(),
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {lostDialog ? (
        <LostReasonDialog
          open
          oppName={lostDialog.name}
          onClose={() => setLostDialog(null)}
          onConfirm={async (reason) => {
            try {
              await markOpportunityLost(lostDialog.id, reason);
              toast.success("Oportunidad marcada como perdida");
              setLostDialog(null);
              router.refresh();
            } catch (err) {
              toast.error(
                err instanceof Error ? err.message : "Error al marcar perdida",
              );
            }
          }}
        />
      ) : null}

      {convertDialog ? (
        <ConvertConfirmDialog
          open
          oppName={convertDialog.name}
          onClose={() => setConvertDialog(null)}
          onConfirm={() =>
            router.push(`/oportunidades/${convertDialog.id}/convertir`)
          }
        />
      ) : null}
    </>
  );
}

function InlineProbability({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [local, setLocal] = React.useState(value);
  const [prevValue, setPrevValue] = React.useState(value);
  if (prevValue !== value) {
    setPrevValue(value);
    setLocal(value);
  }

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="inline-flex h-6 items-center rounded-md border border-transparent px-1.5 text-xs hover:border-border hover:bg-muted"
      >
        {Math.round(value)}%
      </button>
    );
  }

  return (
    <input
      type="number"
      min={0}
      max={100}
      value={local}
      autoFocus
      onChange={(e) => setLocal(Number(e.target.value))}
      onBlur={() => {
        setEditing(false);
        if (local !== value) onChange(local);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setLocal(value);
          setEditing(false);
        }
      }}
      className="h-6 w-14 rounded-md border border-input bg-transparent px-1.5 text-xs"
    />
  );
}
