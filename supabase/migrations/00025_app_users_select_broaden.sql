-- ============================================================
-- 00025_app_users_select_broaden.sql
--
-- Bug: la policy app_users_select original solo permitía ver la
-- fila propia o (si admin) todas. Eso rompía la UX en cualquier
-- lugar que muestra KAMs/owners a usuarios no-admin:
--
--  - Dropdown "KAM" en filtros de /contratos, /clientes, /calendario,
--    /oportunidades quedaba vacío para roles sales / sales_support /
--    viewer / finance / mcp_editor.
--  - Módulo /kam mostraba solo al KAM mismo si era sales, o
--    nada para otros roles.
--  - Joins a app_users desde clients.account_owner_id o
--    contracts.kam_id devolvían name/email = null por RLS, mostrando
--    "Sin KAM" aunque en la base sí lo había.
--
-- Fix: cualquier usuario autenticado activo puede SELECT cualquier
-- otro usuario activo (info de equipo interno: nombre, email, rol).
-- Sigue siendo no expuesto a anon.
--
-- Admin sigue viendo TODO incluyendo soft-deleted para el panel
-- /admin/usuarios.
-- ============================================================

DROP POLICY IF EXISTS app_users_select ON public.app_users;

CREATE POLICY app_users_select ON public.app_users
  FOR SELECT
  USING (
    id = auth.uid()
    OR is_admin()
    OR (auth.uid() IS NOT NULL AND is_active = true AND deleted_at IS NULL)
  );

NOTIFY pgrst, 'reload schema';
