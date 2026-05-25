-- ============================================================
-- 00009_recreate_admin_list_users.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Fix: la función admin_list_users devolvía "structure of query
-- does not match function result type" en runtime aunque los tipos
-- coincidieran. Causa: plan cacheado obsoleto (probablemente tras
-- un ALTER de columna previo). El fix es DROP + CREATE para forzar
-- recompilación.
-- ============================================================

DROP FUNCTION IF EXISTS public.admin_list_users();

CREATE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid,
  full_name text,
  email text,
  role public.user_role,
  is_active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  PERFORM public._require_admin();
  RETURN QUERY
    SELECT au.id,
           au.full_name::text,
           au.email::text,
           au.role,
           au.is_active,
           au.created_at,
           u.last_sign_in_at
      FROM public.app_users au
      LEFT JOIN auth.users u ON u.id = au.id
      WHERE au.deleted_at IS NULL
      ORDER BY au.full_name ASC;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;

NOTIFY pgrst, 'reload schema';
