-- ============================================================
-- 00017_mcp_list_kams.sql
--
-- Tool MCP para listar KAMs (role='sales'). El conector no exponía
-- forma de descubrirlos — solo se podía filtrar clientes/contratos
-- por kam_id pero sin saber qué UUIDs existen. Esto cierra el gap.
--
-- Devuelve también clients_count y contracts_count para que Claude
-- pueda rankear/describir cada KAM sin paginar todo. Opcionalmente
-- incluye sales_support si p_include_support = true.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mcp_list_kams(
  p_user_id uuid,
  p_include_support boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.full_name) FROM (
    SELECT au.id, au.full_name, au.email::text AS email, au.role::text AS role,
           au.phone, au.is_active,
           (SELECT COUNT(*) FROM public.contracts
              WHERE kam_id = au.id AND deleted_at IS NULL) AS contracts_count,
           (SELECT COUNT(*) FROM public.clients
              WHERE account_owner_id = au.id AND deleted_at IS NULL) AS clients_count
    FROM public.app_users au
    WHERE au.deleted_at IS NULL AND au.is_active = true
      AND (au.role = 'sales' OR (p_include_support AND au.role = 'sales_support'))
  ) r), '[]'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_list_kams(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_kams(uuid, boolean) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
