-- ============================================================
-- 00012_add_sales_support_role.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Agrega 'sales_support' al enum user_role.
-- Pensado para personas administrativas que trabajan bajo los KAMs
-- (cierran ciclos operativos: contratos, facturación, despachos).
--
-- Sin FK de jerarquía — pool centralizado. Mismos permisos operativos
-- que `sales`. Los filtros del módulo /kam siguen excluyendolos porque
-- src/lib/actions/kam.ts hace .eq("role", "sales") explícitamente.
-- ============================================================

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'sales_support';

NOTIFY pgrst, 'reload schema';
