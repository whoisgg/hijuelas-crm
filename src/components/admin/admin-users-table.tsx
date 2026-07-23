"use client";

import * as React from "react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { CheckCircle2, Pencil, Plus, ShieldCheck, Trash2, XCircle } from "lucide-react";
import { toast } from "sonner";

import type { AdminUserRow } from "@/lib/actions/admin-users";
import {
  createAdminUser,
  deleteAdminUser,
  setModuleAccess,
  setPlatformAdmin,
  updateAdminUser,
} from "@/lib/actions/admin-users";
import {
  MODULES,
  MODULE_ROLE_OPTIONS,
  type AccessLevel,
} from "@/lib/constants";
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

/**
 * Administración de usuarios de la plataforma (Hijuelas One).
 *
 * El acceso se define por módulo con niveles estándar (admin/editor/viewer)
 * + un rol propio del módulo (ej. CRM: KAM/Soporte/Finanzas), más el flag
 * "Admin de plataforma" que ve y administra todo. El role legacy del CRM se
 * deriva automáticamente para compatibilidad (RLS/MCP/filtros KAM).
 */

type Role = AdminUserRow["role"];

/** Módulos administrables: los nativos live, menos Administración. */
const PLATFORM_MODULES = MODULES.filter(
  (m) => m.status === "live" && m.key !== "admin",
).map((m) => ({ key: m.key, label: m.label }));

const LEVEL_OPTIONS: { value: AccessLevel | ""; label: string }[] = [
  { value: "", label: "Sin acceso" },
  { value: "viewer", label: "Viewer — solo ver" },
  { value: "editor", label: "Editor — opera y edita" },
  { value: "admin", label: "Admin del módulo" },
];

const LEVEL_BADGE: Record<AccessLevel, string> = {
  admin: "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-700 dark:bg-purple-950/50 dark:text-purple-300",
  editor: "border-primary/30 bg-primary/10 text-primary",
  viewer: "border-border bg-muted text-muted-foreground",
};

function moduleLabel(key: string): string {
  return PLATFORM_MODULES.find((m) => m.key === key)?.label ?? key;
}

function moduleRoleLabel(moduleKey: string, value: string | null): string | null {
  if (!value) return null;
  return (
    MODULE_ROLE_OPTIONS[moduleKey]?.find((r) => r.value === value)?.label ?? value
  );
}

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
              <th className="px-3 py-2 text-left font-medium">Accesos</th>
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
                  <div className="flex flex-wrap gap-1">
                    {u.is_platform_admin ? (
                      <Badge
                        variant="outline"
                        className={cn("gap-1 text-[10px] font-medium", LEVEL_BADGE.admin)}
                      >
                        <ShieldCheck className="size-3" /> Plataforma
                      </Badge>
                    ) : null}
                    {Object.entries(u.accesses).map(([moduleKey, a]) => {
                      const roleLabel = moduleRoleLabel(moduleKey, a.moduleRole);
                      return (
                        <Badge
                          key={moduleKey}
                          variant="outline"
                          className={cn("text-[10px] font-medium", LEVEL_BADGE[a.level])}
                        >
                          {moduleLabel(moduleKey)}
                          {roleLabel ? ` · ${roleLabel}` : ""}
                          {a.level !== "editor" ? ` (${a.level})` : ""}
                        </Badge>
                      );
                    })}
                    {!u.is_platform_admin && Object.keys(u.accesses).length === 0 ? (
                      <span className="text-xs text-muted-foreground">Sin accesos</span>
                    ) : null}
                  </div>
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

/**
 * Role legacy derivado del acceso (compatibilidad RLS/MCP/filtros KAM
 * mientras dura la transición). El rol propio del CRM manda.
 */
function deriveLegacyRole(
  platformAdmin: boolean,
  levels: Record<string, AccessLevel | "">,
  roles: Record<string, string>,
  fallback: Role,
): Role {
  if (platformAdmin) return "admin";
  const crmRole = roles["crm"];
  if (levels["crm"]) {
    if (crmRole === "kam") return "sales";
    if (crmRole === "soporte") return "sales_support";
    if (crmRole === "finanzas") return "finance";
    if (levels["crm"] === "viewer") return "viewer";
  }
  if (!levels["crm"] && levels["planner"]) return "produccion";
  return fallback;
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
  const [isActive, setIsActive] = React.useState(user?.is_active ?? true);
  const [platformAdmin, setPlatformAdminState] = React.useState(
    user?.is_platform_admin ?? false,
  );
  const [levels, setLevels] = React.useState<Record<string, AccessLevel | "">>(() =>
    Object.fromEntries(
      PLATFORM_MODULES.map((m) => [m.key, user?.accesses[m.key]?.level ?? ""]),
    ),
  );
  const [roles, setRoles] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      PLATFORM_MODULES.map((m) => [m.key, user?.accesses[m.key]?.moduleRole ?? ""]),
    ),
  );
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const legacyRole = deriveLegacyRole(
        platformAdmin,
        levels,
        roles,
        user?.role ?? "viewer",
      );

      let userId = user?.id;
      if (isEdit) {
        const res = await updateAdminUser({
          id: user!.id,
          full_name: fullName,
          email,
          role: legacyRole,
          is_active: isActive,
          password: password || undefined,
        });
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
      } else {
        const res = await createAdminUser({
          full_name: fullName,
          email,
          password,
          role: legacyRole,
        });
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        userId = res.id;
      }

      if (!userId) throw new Error("Sin id de usuario.");

      // Flag admin de plataforma (solo si cambió)
      if (platformAdmin !== (user?.is_platform_admin ?? false)) {
        const res = await setPlatformAdmin(userId, platformAdmin);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
      }

      // Accesos por módulo (solo los que cambiaron)
      for (const m of PLATFORM_MODULES) {
        const prevLevel = user?.accesses[m.key]?.level ?? "";
        const prevRole = user?.accesses[m.key]?.moduleRole ?? "";
        const nextLevel = levels[m.key] ?? "";
        const nextRole = roles[m.key] ?? "";
        if (prevLevel === nextLevel && prevRole === nextRole) continue;
        const res = await setModuleAccess({
          user_id: userId,
          module_key: m.key,
          level: nextLevel === "" ? null : nextLevel,
          module_role: nextRole === "" ? null : nextRole,
        });
        if (!res.ok) {
          toast.error(`${m.label}: ${res.message}`);
          return;
        }
      }

      toast.success(isEdit ? "Usuario actualizado." : "Usuario creado.");
      onClose();
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
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
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

          <div className="space-y-2 rounded-lg border p-3">
            <p className="text-sm font-medium">Accesos</p>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={platformAdmin}
                onChange={(e) => setPlatformAdminState(e.target.checked)}
                className="accent-primary"
              />
              <span>
                Admin de plataforma
                <span className="block text-xs text-muted-foreground">
                  Ve y administra todos los módulos, usuarios y maestros.
                </span>
              </span>
            </label>

            {platformAdmin ? null : (
              <div className="space-y-2 pt-1">
                {PLATFORM_MODULES.map((m) => {
                  const moduleRoles = MODULE_ROLE_OPTIONS[m.key] ?? [];
                  const level = levels[m.key] ?? "";
                  return (
                    <div key={m.key} className="grid grid-cols-[1fr_1fr] items-end gap-2">
                      <div className="space-y-1">
                        <Label htmlFor={`lvl-${m.key}`} className="text-xs">
                          {m.label}
                        </Label>
                        <select
                          id={`lvl-${m.key}`}
                          value={level}
                          onChange={(e) =>
                            setLevels((s) => ({
                              ...s,
                              [m.key]: e.target.value as AccessLevel | "",
                            }))
                          }
                          className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                        >
                          {LEVEL_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      {moduleRoles.length && level ? (
                        <div className="space-y-1">
                          <Label htmlFor={`rol-${m.key}`} className="text-xs">
                            Rol en {m.label}
                          </Label>
                          <select
                            id={`rol-${m.key}`}
                            value={roles[m.key] ?? ""}
                            onChange={(e) =>
                              setRoles((s) => ({ ...s, [m.key]: e.target.value }))
                            }
                            className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                          >
                            <option value="">Sin rol específico</option>
                            {moduleRoles.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        </div>
                      ) : (
                        <div />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
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
