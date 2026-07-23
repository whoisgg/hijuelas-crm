"use client";

import * as React from "react";
import { Package, Pencil, Plus, Search } from "lucide-react";
import { toast } from "sonner";

import {
  createBodegaProducto,
  updateBodegaProducto,
} from "@/lib/actions/bodega-productos";
import {
  BODEGA_CATEGORIAS,
  BODEGA_ESTADO_STOCK,
  BODEGA_TIPOS_INVENTARIO,
} from "@/lib/bodega/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

export type BodegaStockRow = {
  id: string;
  codigo: string;
  nombre: string;
  descripcion: string | null;
  categoria: string | null;
  tipoInventario: string | null;
  unidad: string | null;
  stockMinimo: number;
  ingresos: number;
  salidas: number;
  disponible: number;
  estado: string;
  cuentaContable: string | null;
};

const ESTADO_TONE: Record<string, string> = {
  danger:
    "border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/50 dark:text-red-300",
  warning:
    "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
  ok: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300",
};

const FILTERS = [
  { key: "todos", label: "Todos" },
  { key: "urgente", label: "Urgente" },
  { key: "bajo", label: "Bajo" },
  { key: "suficiente", label: "Suficiente" },
] as const;

const PAGE_SIZE = 30;

export function BodegaProductosTable({
  rows,
  unidades,
  canEdit,
}: {
  rows: BodegaStockRow[];
  unidades: string[];
  canEdit: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]["key"]>("todos");
  const [page, setPage] = React.useState(0);
  const [creating, setCreating] = React.useState(false);
  const [editing, setEditing] = React.useState<BodegaStockRow | null>(null);

  const counts = React.useMemo(() => {
    const c = { todos: rows.length, urgente: 0, bajo: 0, suficiente: 0 };
    for (const r of rows) {
      if (r.estado === "urgente") c.urgente++;
      else if (r.estado === "bajo") c.bajo++;
      else c.suficiente++;
    }
    return c;
  }, [rows]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "todos" && r.estado !== filter) return false;
      if (!q) return true;
      return (
        r.codigo.toLowerCase().includes(q) ||
        r.nombre.toLowerCase().includes(q) ||
        (r.descripcion ?? "").toLowerCase().includes(q) ||
        (r.categoria ?? "").toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="Buscar por código, nombre o categoría…"
            className="pl-8"
          />
        </div>
        <div className="flex gap-1">
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              onClick={() => {
                setFilter(f.key);
                setPage(0);
              }}
            >
              {f.label}
              <span className="ml-1 text-xs opacity-70">{counts[f.key]}</span>
            </Button>
          ))}
        </div>
        {canEdit ? (
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus className="size-4" />
            Nuevo producto
          </Button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Código</th>
                <th className="px-3 py-2 text-left font-medium">Producto</th>
                <th className="px-3 py-2 text-left font-medium">Categoría</th>
                <th className="px-3 py-2 text-right font-medium">Stock</th>
                <th className="px-3 py-2 text-right font-medium">Mínimo</th>
                <th className="px-3 py-2 text-left font-medium">Estado</th>
                {canEdit ? <th className="px-3 py-2 text-right font-medium">Acciones</th> : null}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visible.map((r) => {
                const estado = BODEGA_ESTADO_STOCK[r.estado] ?? BODEGA_ESTADO_STOCK.suficiente;
                return (
                  <tr key={r.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">
                      {r.codigo}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="font-medium">{r.nombre}</p>
                      {r.descripcion ? (
                        <p className="max-w-md truncate text-xs text-muted-foreground">
                          {r.descripcion}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">
                      {r.categoria ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {formatQty(r.disponible)}
                      {r.unidad ? (
                        <span className="ml-1 text-xs text-muted-foreground">{r.unidad}</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                      {formatQty(r.stockMinimo)}
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge
                        variant="outline"
                        className={cn("text-[10px] font-medium", ESTADO_TONE[estado.tone])}
                      >
                        {estado.label}
                      </Badge>
                    </td>
                    {canEdit ? (
                      <td className="px-3 py-2.5">
                        <div className="flex justify-end">
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => setEditing(r)}
                            aria-label="Editar"
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    ) : null}
                  </tr>
                );
              })}
              {visible.length === 0 ? (
                <tr>
                  <td
                    colSpan={canEdit ? 7 : 6}
                    className="px-3 py-10 text-center text-sm text-muted-foreground"
                  >
                    <Package className="mx-auto mb-2 size-6 opacity-40" />
                    {rows.length === 0
                      ? "Aún no hay productos. Crea el primero o importa el catálogo de Ventory (fase 4)."
                      : "Sin resultados para el filtro actual."}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {filtered.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t px-3 py-2 text-xs text-muted-foreground">
            <span>
              Mostrando {safePage * PAGE_SIZE + 1}–
              {Math.min((safePage + 1) * PAGE_SIZE, filtered.length)} de {filtered.length}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                disabled={safePage === 0}
                onClick={() => setPage(safePage - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={safePage >= pageCount - 1}
                onClick={() => setPage(safePage + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      {creating ? (
        <ProductoFormDialog unidades={unidades} onClose={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <ProductoFormDialog
          unidades={unidades}
          producto={editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </div>
  );
}

function formatQty(n: number): string {
  return n.toLocaleString("es-CL", { maximumFractionDigits: 2 });
}

function ProductoFormDialog({
  producto,
  unidades,
  onClose,
}: {
  producto?: BodegaStockRow;
  unidades: string[];
  onClose: () => void;
}) {
  const isEdit = !!producto;
  const [nombre, setNombre] = React.useState(producto?.nombre ?? "");
  const [descripcion, setDescripcion] = React.useState(producto?.descripcion ?? "");
  const [categoria, setCategoria] = React.useState(producto?.categoria ?? "SIN DEFINIR");
  const [unidad, setUnidad] = React.useState(producto?.unidad ?? "UNIDAD");
  const [tipoInventario, setTipoInventario] = React.useState(
    producto?.tipoInventario ?? "GENERAL",
  );
  const [stockMinimo, setStockMinimo] = React.useState(
    producto ? String(producto.stockMinimo) : "0",
  );
  const [cuentaContable, setCuentaContable] = React.useState(
    producto?.cuentaContable ?? "",
  );
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    const minimo = Number(stockMinimo.replace(",", "."));
    if (Number.isNaN(minimo) || minimo < 0) {
      toast.error("Stock mínimo inválido.");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        nombre_prod: nombre,
        descripcion,
        categoria,
        unidad_medida: unidad,
        tipo_inventario: tipoInventario,
        stock_minimo: minimo,
        cuenta_contable: cuentaContable,
      };
      const res = isEdit
        ? await updateBodegaProducto(producto!.id, { ...payload, activo: true })
        : await createBodegaProducto(payload);
      if (res.ok) {
        toast.success(
          isEdit ? "Producto actualizado." : `Producto creado (${"codigo" in res ? res.codigo : ""}).`,
        );
        onClose();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  const selectCls =
    "h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring";

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? `Editar ${producto!.codigo}` : "Nuevo producto"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="bp-nombre">Nombre</Label>
            <Input
              id="bp-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: Guantes de nitrilo talla M"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-desc">Descripción (opcional)</Label>
            <Input
              id="bp-desc"
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="bp-cat">Categoría</Label>
              <select
                id="bp-cat"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
                className={selectCls}
              >
                {BODEGA_CATEGORIAS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-uni">Unidad</Label>
              <select
                id="bp-uni"
                value={unidad}
                onChange={(e) => setUnidad(e.target.value)}
                className={selectCls}
              >
                {unidades.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-tipo">Tipo inventario</Label>
              <select
                id="bp-tipo"
                value={tipoInventario}
                onChange={(e) => setTipoInventario(e.target.value)}
                className={selectCls}
              >
                {BODEGA_TIPOS_INVENTARIO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="bp-min">Stock mínimo</Label>
              <Input
                id="bp-min"
                inputMode="decimal"
                value={stockMinimo}
                onChange={(e) => setStockMinimo(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bp-cta">Cuenta contable (opcional)</Label>
            <Input
              id="bp-cta"
              value={cuentaContable}
              onChange={(e) => setCuentaContable(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || nombre.trim().length < 2}>
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear producto"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
