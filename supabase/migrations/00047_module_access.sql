-- 00047: Sistema de usuarios y permisos multi-módulo (Hijuelas One)
--
-- Modelo: acceso por módulo con niveles estándar (admin/editor/viewer) +
-- rol propio de cada módulo (ej. CRM: kam/soporte/finanzas), separado del
-- nivel. Admin de plataforma como flag en app_users.
--
-- El enum user_role y la columna app_users.role se mantienen durante la
-- transición: RLS, MCP y filtros KAM existentes siguen leyéndolos. La RPC
-- admin_set_module_access espeja el rol propio del CRM al role legacy para
-- no romper esos consumidores (fase 4: eliminar el espejo).

-- 1. Enum de niveles estándar --------------------------------------------

create type public.module_access_level as enum ('admin', 'editor', 'viewer');

-- 2. Flag admin de plataforma --------------------------------------------

alter table public.app_users
  add column if not exists is_platform_admin boolean not null default false;

update public.app_users set is_platform_admin = true where role = 'admin';

-- 3. Tabla module_access --------------------------------------------------

create table public.module_access (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.app_users (id) on delete cascade,
  module_key text not null,
  level public.module_access_level not null default 'viewer',
  -- rol propio del módulo (ej. crm: kam / soporte / finanzas). Libre por
  -- módulo; el catálogo de valores válidos vive en el código.
  module_role text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, module_key)
);

alter table public.module_access enable row level security;

-- Lectura abierta al equipo autenticado (igual que app_users); escritura
-- solo vía RPC SECURITY DEFINER.
create policy module_access_select on public.module_access
  for select to authenticated using (true);

-- 4. _require_admin acepta el flag de plataforma --------------------------
-- Se conserva la firma original (returns uuid, 00008); solo se extiende el
-- check a role='admin' OR is_platform_admin.

create or replace function public._require_admin()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  caller_id uuid;
  caller_role public.user_role;
  caller_active boolean;
  caller_platform boolean;
begin
  caller_id := auth.uid();
  if caller_id is null then
    raise exception 'No autenticado.' using errcode = '42501';
  end if;
  select role, is_active, is_platform_admin
    into caller_role, caller_active, caller_platform
    from public.app_users
    where id = caller_id and deleted_at is null;
  if (caller_role is distinct from 'admin' and caller_platform is not true)
     or caller_active is not true then
    raise exception 'Solo admin.' using errcode = '42501';
  end if;
  return caller_id;
end;
$$;

-- 5. RPC: asignar / revocar acceso a módulo -------------------------------

create or replace function public.admin_set_module_access(
  p_user_id uuid,
  p_module_key text,
  p_level text,          -- 'admin' | 'editor' | 'viewer' | null = revocar
  p_module_role text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();

  if p_level is null then
    delete from public.module_access
    where user_id = p_user_id and module_key = p_module_key;
    return;
  end if;

  insert into public.module_access (user_id, module_key, level, module_role)
  values (p_user_id, p_module_key, p_level::public.module_access_level, p_module_role)
  on conflict (user_id, module_key) do update
    set level = excluded.level,
        module_role = excluded.module_role,
        updated_at = now();

  -- Espejo de compatibilidad: el rol propio del CRM mantiene sincronizado
  -- el role legacy que usan RLS, MCP y los filtros de KAM. No toca admins.
  if p_module_key = 'crm' then
    update public.app_users
    set role = case p_module_role
        when 'kam' then 'sales'::public.user_role
        when 'soporte' then 'sales_support'::public.user_role
        when 'finanzas' then 'finance'::public.user_role
        else role
      end
    where id = p_user_id
      and role <> 'admin'
      and p_module_role in ('kam', 'soporte', 'finanzas');
  end if;
end;
$$;

grant execute on function public.admin_set_module_access(uuid, text, text, text) to authenticated;

-- 6. RPC: admin de plataforma ---------------------------------------------

create or replace function public.admin_set_platform_admin(
  p_user_id uuid,
  p_value boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public._require_admin();
  if p_user_id = auth.uid() and not p_value then
    raise exception 'No puedes quitarte tu propio acceso de administrador.';
  end if;
  update public.app_users set is_platform_admin = p_value where id = p_user_id;
end;
$$;

grant execute on function public.admin_set_platform_admin(uuid, boolean) to authenticated;

-- 7. Backfill desde los roles legacy --------------------------------------

insert into public.module_access (user_id, module_key, level, module_role)
select id, 'crm',
  case role
    when 'viewer' then 'viewer'::public.module_access_level
    else 'editor'::public.module_access_level
  end,
  case role
    when 'sales' then 'kam'
    when 'sales_support' then 'soporte'
    when 'finance' then 'finanzas'
    else null
  end
from public.app_users
where deleted_at is null
  and role in ('sales', 'sales_support', 'finance', 'viewer', 'mcp_editor')
on conflict (user_id, module_key) do nothing;

insert into public.module_access (user_id, module_key, level, module_role)
select id, 'planner', 'editor'::public.module_access_level, null
from public.app_users
where deleted_at is null and role = 'produccion'
on conflict (user_id, module_key) do nothing;

-- 8. Recargar schema PostgREST --------------------------------------------

notify pgrst, 'reload schema';
