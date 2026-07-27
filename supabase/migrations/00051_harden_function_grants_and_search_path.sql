-- 00051 — Hardening de funciones: search_path fijo + cierre de EXECUTE a anon/PUBLIC
--
-- Contexto: el advisor de Supabase reportaba 167 warnings (0 errores). Dos familias:
--   1. 12 funciones propias sin `search_path` fijo (function_search_path_mutable).
--   2. 76 funciones SECURITY DEFINER ejecutables por `anon` y `authenticated`.
--
-- OJO — por qué NO se revoca anon en las funciones `mcp_*`:
-- el servidor MCP (`src/app/api/[transport]/route.ts`) llama a los RPC con la
-- key ANON (ver `supabaseAnonClient()` en `src/lib/mcp/auth.ts`), igual que el
-- webhook de DocuSign con `docusign_apply_event` y la ficha pública con
-- `public_get_shared_client`. Revocarles anon rompe producción.
-- Queda pendiente el problema de fondo: `_mcp_require_active(p_user_id)` confía
-- en el uuid que le pasa el llamador y no valida el token, así que anon + un
-- uuid de usuario activo = acceso al CRM. Se arregla aparte (service role en la
-- ruta MCP, o pasar el token al RPC). Ver nota en el vault.
--
-- Varias funciones traían además el grant implícito a PUBLIC (`=X/postgres` en
-- proacl), por eso cada bloque revoca de PUBLIC y de anon: revocar solo de anon
-- no habría hecho nada.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. search_path fijo en las 12 funciones propias que no lo tenían
--    Verificado antes de aplicar: ninguna usa funciones del schema `extensions`
--    (digest/crypt/gen_random_bytes) ni referencias sin calificar a `auth`,
--    así que fijar el search_path no cambia la resolución de nombres.
-- ─────────────────────────────────────────────────────────────────────────────
alter function public.is_admin() set search_path = public, pg_temp;
alter function public.is_sales() set search_path = public, pg_temp;
alter function public.is_finance() set search_path = public, pg_temp;
alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public._planner_norm_name(text) set search_path = public, pg_temp;
alter function public._mcp_contract_status_match(text, text) set search_path = public, pg_temp;
alter function public.planner_apply_scenario_to_plan(integer) set search_path = public, pg_temp;
alter function public.planner_copy_lots_to_scenario(integer) set search_path = public, pg_temp;
alter function public.bodega_asignar_codigo_producto() set search_path = public, pg_temp;
alter function public.bodega_asignar_codigo_ingreso() set search_path = public, pg_temp;
alter function public.bodega_asignar_codigo_traspaso() set search_path = public, pg_temp;
alter function public.bodega_asignar_codigo_solicitud() set search_path = public, pg_temp;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Helpers internos y funciones de trigger: nadie las llama desde el cliente.
--    Los helpers `_require_*` corren dentro de otras funciones SECURITY DEFINER
--    (ahí aplica el privilegio del owner, no el del rol que llamó), y Postgres
--    no chequea EXECUTE para disparar un trigger. Se cierran a los tres roles.
-- ─────────────────────────────────────────────────────────────────────────────
revoke all on function public._require_admin() from public, anon, authenticated;
revoke all on function public._mcp_require_active(uuid) from public, anon, authenticated;
revoke all on function public._mcp_require_signer(uuid) from public, anon, authenticated;
revoke all on function public._mcp_require_writer(uuid) from public, anon, authenticated;
revoke all on function public.mcp_planner_role_ok(uuid) from public, anon, authenticated;
revoke all on function public._mcp_contract_status_match(text, text) from public, anon, authenticated;

revoke all on function public._sync_app_user_from_auth() from public, anon, authenticated;
revoke all on function public._sync_client_account_owner_from_contract() from public, anon, authenticated;
revoke all on function public.log_activity() from public, anon, authenticated;
revoke all on function public.on_delivery_create_royalty() from public, anon, authenticated;
revoke all on function public.on_opportunity_stage_change() from public, anon, authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;
revoke all on function public.bodega_asignar_codigo_producto() from public, anon, authenticated;
revoke all on function public.bodega_asignar_codigo_ingreso() from public, anon, authenticated;
revoke all on function public.bodega_asignar_codigo_traspaso() from public, anon, authenticated;
revoke all on function public.bodega_asignar_codigo_solicitud() from public, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Funciones que solo se llaman con sesión: se cierran a anon/PUBLIC y se
--    re-otorgan a authenticated. Todas resuelven el actor con auth.uid()
--    internamente, así que un llamador anon nunca podía hacer nada útil — esto
--    es defensa en profundidad + saca el warning del advisor.
-- ─────────────────────────────────────────────────────────────────────────────
do $$
declare
  v_fn text;
  v_fns text[] := array[
    -- panel de administración (/admin/usuarios, /admin/organizaciones)
    'public.admin_create_user(text, text, text, public.user_role)',
    'public.admin_delete_user(uuid)',
    'public.admin_list_organizations()',
    'public.admin_list_users()',
    'public.admin_set_module_access(uuid, text, text, text)',
    'public.admin_set_platform_admin(uuid, boolean)',
    'public.admin_update_organization_legal(uuid, text, text, text, text, text, text, text, text, text, text)',
    'public.admin_update_user(uuid, text, text, public.user_role, boolean, text)',
    -- share links de cliente (la lectura pública va por public_get_shared_client)
    'public.create_client_share_link(uuid, integer)',
    'public.list_client_share_links(uuid)',
    'public.revoke_client_share_link(uuid)',
    -- tokens MCP: se administran desde la UI, resuelven auth.uid()
    'public.mcp_create_token(text)',
    'public.mcp_list_my_tokens()',
    'public.mcp_revoke_token(uuid)',
    -- DocuSign desde server actions (el webhook solo usa docusign_apply_event)
    'public.docusign_record_sent(uuid, text, text, text, text)',
    'public.docusign_set_signed_pdf(text, text, text)',
    -- planner: mesa de trabajo / aprobar plan
    'public.planner_apply_scenario_to_plan(integer)',
    'public.planner_copy_lots_to_scenario(integer)',
    -- helpers usados dentro de políticas RLS: authenticated los necesita
    'public.is_admin()',
    'public.is_sales()',
    'public.is_finance()',
    'public.is_builder(uuid)',
    'public.current_user_role()',
    'public.sales_can_write_client(uuid)',
    'public._bodega_access()',
    'public._bodega_can_read()',
    'public._bodega_can_manage()'
  ];
begin
  foreach v_fn in array v_fns loop
    execute format('revoke all on function %s from public, anon', v_fn);
    execute format('grant execute on function %s to authenticated', v_fn);
  end loop;
end $$;

notify pgrst, 'reload schema';
