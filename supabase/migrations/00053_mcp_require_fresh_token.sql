-- 00053 — Mitigar la escalada de privilegios vía los RPC `mcp_*`
--
-- PROBLEMA (detectado 2026-07-27, ver nota del vault "Vulnerabilidad MCP p_user_id"):
-- las ~42 funciones `mcp_*` reciben el actor como PARÁMETRO (`p_user_id`) y son
-- ejecutables por `anon`, cuya key es pública (va en el bundle del browser).
-- `_mcp_require_active` solo verificaba que ese uuid existiera y estuviera
-- activo — no validaba ningún token. Y como `app_users_select` deja a cualquier
-- usuario autenticado leer los uuid de todos los usuarios activos, un `viewer`
-- podía escribir en el CRM haciéndose pasar por un admin.
--
-- ARREGLO DEFINITIVO (pendiente, necesita un secreto): usar la service role key
-- en `src/lib/mcp/auth.ts` y revocar `anon` sobre las `mcp_*`. Ver la nota.
--
-- MITIGACIÓN (esto): atar la llamada a una sesión real del conector. La ruta MCP
-- valida el bearer token en CADA request vía `mcp_validate_token`, que refresca
-- `mcp_tokens.last_used_at`. Entonces se exige que el usuario suplantado tenga
-- un token vigente **validado hace menos de 5 minutos**. Un atacante con solo el
-- uuid ya no puede llamar: necesitaría además acertar la ventana justo después
-- de una request legítima de ese mismo usuario.
--
-- No cierra el agujero del todo (queda una ventana de piggyback), pero lo
-- reduce de "acceso permanente con solo un uuid" a "hay que ganarle una carrera
-- de 5 minutos a una sesión ajena". No cambia ninguna firma ni requiere
-- secretos nuevos, así que no rompe el conector.
--
-- Ojo: los dos tokens activos son de admins, así que exigir "tener token" por sí
-- solo no aportaba nada — el filtro que importa es la frescura.

create or replace function public._mcp_token_fresh(
  p_user_id uuid,
  p_max_age interval default interval '5 minutes'
) returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.mcp_tokens t
    where t.user_id = p_user_id
      and t.revoked_at is null
      and t.last_used_at is not null
      and t.last_used_at > now() - p_max_age
  );
$$;

-- Helper interno: nadie lo llama desde el cliente.
revoke all on function public._mcp_token_fresh(uuid, interval) from public, anon, authenticated;

create or replace function public._mcp_require_active(p_user_id uuid)
returns public.user_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
DECLARE
  v_role public.user_role;
  v_active boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Falta user_id.' USING ERRCODE = '42501';
  END IF;
  SELECT role, is_active INTO v_role, v_active
    FROM public.app_users
    WHERE id = p_user_id AND deleted_at IS NULL;
  IF v_role IS NULL OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501';
  END IF;
  IF NOT public._mcp_token_fresh(p_user_id) THEN
    RAISE EXCEPTION 'Sesión MCP no vigente para este usuario.' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END;
$$;

create or replace function public._mcp_require_signer(p_user_id uuid)
returns public.user_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
DECLARE r public.user_role;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501'; END IF;
  SELECT role INTO r FROM public.app_users
    WHERE id = p_user_id AND deleted_at IS NULL AND is_active = true;
  IF r IS NULL THEN RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501'; END IF;
  IF r NOT IN ('admin','mcp_editor','sales','sales_support') THEN
    RAISE EXCEPTION 'Rol % no autorizado a firmar vía MCP.', r USING ERRCODE = '42501';
  END IF;
  IF NOT public._mcp_token_fresh(p_user_id) THEN
    RAISE EXCEPTION 'Sesión MCP no vigente para este usuario.' USING ERRCODE = '42501';
  END IF;
  RETURN r;
END;
$$;

create or replace function public.mcp_planner_role_ok(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.app_users
    where id = p_user_id and is_active and deleted_at is null
      and role in ('admin','produccion','mcp_editor')
  ) and public._mcp_token_fresh(p_user_id);
$$;

revoke all on function public._mcp_require_active(uuid) from public, anon, authenticated;
revoke all on function public._mcp_require_signer(uuid) from public, anon, authenticated;
revoke all on function public.mcp_planner_role_ok(uuid) from public, anon, authenticated;

notify pgrst, 'reload schema';
