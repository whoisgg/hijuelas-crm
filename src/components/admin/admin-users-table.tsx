"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, Pencil, Plus, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import type { AdminUserRow } from "@/lib/actions/admin-users";
import {
  createAdminUser,
  deleteAdminUser,
  updateAdminUser,
} from "@/lib/actions/admin-users";
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

type Role =
  | "admin"
  | "sales"
  | "sales_support"
  | "finance"
  | "viewer"
  | "mcp_editor"
  | "produccion";

const ROLE_OPTIONS: { value: Role; label: string }[] = [
  { value: "admin", label: "Admin" },
  { value: "sales", label: "Sales (KAM)" },
  { value: "sales_support", label: "Sales (Soporte)" },
  { value: "finance", label: "Finance" },
  { value: "viewer", label: "Viewer" },
  { value: "mcp_editor", label: "MCP Editor" },
  { value: "produccion", label: "Producción" },
];

const ROLE_TONE: Record<Role, string> = {
  admin: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  sales: "border-primary/30 bg-primary/10 text-primary",
  sales_support: "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
  finance: "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
  viewer: "border-border bg-muted text-muted-foreground",
  mcp_editor:
    "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
  produccion:
    "border-lime-300 bg-lime-50 text-lime-700 dark:border-lime-700 dark:bg-lime-950/50 dark:text-lime-300",
};

export function AdminUsersTable({ users }: { users: AdminUserRow[] }) {
  const [editing, setEditing] = React.useState<AdminUserRow | null>(null);
  const [creating, setCreating] = React.useState(false);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {users.length} usuario{users.length === 1 ? "" : "s"}
        </p>
        <Button onClick={() => setCreating(true)} size="sm">
          <Plus className="size-4" />
          Nuevo usuario
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Nombre</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Rol</th>
              <th className="px-3 py-2 text-left font-medium">Estado</th>
              <th className="px-3 py-2 text-left font-medium">Último login</th>
              <th className="px-3 py-2 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-muted/30">
                <td className="px-3 py-2.5 font-medium">{u.full_name ?? "—"}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{u.email}</td>
                <td className="px-3 py-2.5">
                  <Badge
                    variant="outline"
                    className={cn("text-[10px] font-medium", ROLE_TONE[u.role])}
                  >
                    {ROLE_OPTIONS.find((r) => r.value === u.role)?.label ?? u.role}
                  </Badge>
                </td>
                <td className="px-3 py-2.5">
                  {u.is_active ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-400">
                      <CheckCircle2 className="size-3" /> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <XCircle className="size-3" /> Inactivo
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">
                  {u.last_sign_in_at
                    ? formatDistanceToNow(new Date(u.last_sign_in_at), {
                        locale: es,
                        addSuffix: true,
                      })
                    : "Nunca"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => setEditing(u)}
                      aria-label="Editar"
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => confirmDelete(u)}
                      aria-label="Eliminar"
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-sm text-muted-foreground">
                  Sin usuarios.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {creating ? (
        <UserFormDialog onClose={() => setCreating(false)} />
      ) : null}
      {editing ? (
        <UserFormDialog user={editing} onClose={() => setEditing(null)} />
      ) : null}
    </div>
  );
}

async function confirmDelete(user: AdminUserRow) {
  if (
    !window.confirm(
      `¿Eliminar a ${user.full_name ?? user.email}? Se marcará como inactivo y no podrá iniciar sesión.`,
    )
  ) {
    return;
  }
  const res = await deleteAdminUser(user.id);
  if (res.ok) toast.success("Usuario eliminado.");
  else toast.error(res.message);
}

function UserFormDialog({
  user,
  onClose,
}: {
  user?: AdminUserRow;
  onClose: () => void;
}) {
  const isEdit = !!user;
  const [fullName, setFullName] = React.useState(user?.full_name ?? "");
  const [email, setEmail] = React.useState(user?.email ?? "");
  const [password, setPassword] = React.useState(isEdit ? "" : "hijuelascrm2026");
  const [role, setRole] = React.useState<Role>(user?.role ?? "sales");
  const [isActive, setIsActive] = React.useState(user?.is_active ?? true);
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const res = isEdit
        ? await updateAdminUser({
            id: user!.id,
            full_name: fullName,
            email,
            role,
            is_active: isActive,
            password: password || undefined,
          })
        : await createAdminUser({
            full_name: fullName,
            email,
            password,
            role,
          });
      if (res.ok) {
        toast.success(isEdit ? "Usuario actualizado." : "Usuario creado.");
        onClose();
      } else {
        toast.error(res.message);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open: boolean) => {
        if (!open) onClose();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="fn">Nombre completo</Label>
            <Input
              id="fn"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej: Juan Pérez"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="em">Email</Label>
            <Input
              id="em"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@grupohijuelas.com"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pw">
              {isEdit ? "Nueva password (opcional)" : "Password inicial"}
            </Label>
            <Input
              id="pw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={isEdit ? "Dejar vacío para no cambiar" : "Mínimo 8 caracteres"}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role">Rol</Label>
            <select
              id="role"
              value={role}
              onChange={(e) => setRole(e.target.value as Role)}
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          {isEdit ? (
            <label className="inline-flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="accent-primary"
              />
              Activo
            </label>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Guardando…" : isEdit ? "Guardar" : "Crear usuario"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
