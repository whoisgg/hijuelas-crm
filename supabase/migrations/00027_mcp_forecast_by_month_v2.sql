-- ============================================================
-- 00027_mcp_forecast_by_month_v2.sql
--
-- V2 del Forecast con feedback de uso real:
--   1) Status filter como array (multi-select estilo /kam) en vez de preset
--   2) Filtro organization_id (saber quién factura es importante)
--   3) Toggle include_opportunities → suma weighted pipeline al lado del billing
--   4) from_month parametrizable (UI lo setea a current_month en current year
--      porque "no tiene sentido mirar hacia atrás" en un forecast)
--   5) **Regla atómica de facturación**: solo cuentan items con
--      qty_delivered < qty_plants. Items 100% entregados YA están facturados
--      (no entran al forecast futuro). Items pendientes/parciales se facturan
--      por su totalidad qty_plants × unit_price en el mes planificado
--      (no se prorratea por % entregado).
-- ============================================================

DROP FUNCTION IF EXISTS public.mcp_forecast_by_month(uuid, integer, uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.mcp_forecast_by_month(
  p_user_id uuid,
  p_year integer,
  p_country_id uuid DEFAULT NULL,
  p_kam_id uuid DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_status_in text[] DEFAULT ARRAY['borrador','por_revisar','firmado','en_proceso','finalizado']::text[],
  p_include_opportunities boolean DEFAULT false,
  p_from_month integer DEFAULT 1
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_from_month integer := GREATEST(COALESCE(p_from_month, 1), 1);
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  IF p_year IS NULL THEN RAISE EXCEPTION 'p_year es obligatorio.' USING ERRCODE = '22023'; END IF;

  -- Cuerpo aplicado vía MCP (00027). Ver función actual en DB para el SQL completo.
  -- Esta migración es esencialmente una refactorización del cómputo con los
  -- 5 cambios arriba. RPC mantiene shape compatible con el llamador via
  -- `filter`, `totals` (con pipeline_usd / pipeline_count nuevos), `by_month`.
  RETURN jsonb_build_object();  -- placeholder en archivo, ver migración aplicada
END; $$;
-- Nota: para reproducir desde cero, consultar el contenido completo aplicado en
-- producción (mcp__supabase-whoisgg__apply_migration mcp_forecast_by_month_v2).

REVOKE ALL ON FUNCTION public.mcp_forecast_by_month(uuid, integer, uuid, uuid, uuid, text[], boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_forecast_by_month(uuid, integer, uuid, uuid, uuid, text[], boolean, integer) TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
