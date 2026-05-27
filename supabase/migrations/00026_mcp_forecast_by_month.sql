-- ============================================================
-- 00026_mcp_forecast_by_month.sql
--
-- Módulo Forecast: proyección mensual de facturación por año.
--
-- Reglas de inclusión (lo que cuenta):
--  - contracts.condition = 'venta' (excluye reposicion/muestra)
--  - contract_items.unit_price > 0 (excluye legacy importado del Excel
--    sin precio + drafts incompletos)
--  - contracts.deleted_at IS NULL, items.deleted_at IS NULL
--  - status_filter parameterizable (default 'active' = no cancelados)
--
-- Mes derivado: usa delivery_month si está; sino lo deriva de
-- delivery_week con to_date(year || lpad(week,2,'0'), 'IYYYIW').
--
-- Conversion a USD por orden de preferencia:
--  1. ratio total_neto_usd / total_neto del contrato padre (más preciso)
--  2. multiplicar por fx_rate_to_usd
--  3. si currency = 'USD' usar el monto local directo
--  4. fallback 0
--
-- Devuelve totales + array por mes (1..12) + drill-down por cliente
-- dentro de cada mes (sorted billing DESC).
-- ============================================================

CREATE OR REPLACE FUNCTION public.mcp_forecast_by_month(
  p_user_id uuid,
  p_year integer,
  p_country_id uuid DEFAULT NULL,
  p_kam_id uuid DEFAULT NULL,
  p_status_filter text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  IF p_year IS NULL THEN
    RAISE EXCEPTION 'p_year es obligatorio.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'filter', jsonb_build_object(
      'year', p_year, 'country_id', p_country_id, 'kam_id', p_kam_id,
      'status_filter', COALESCE(p_status_filter, 'active')
    ),
    'totals', (SELECT to_jsonb(t) FROM (
      SELECT COALESCE(SUM(ci.qty_plants), 0) AS plants_total,
             COUNT(DISTINCT ct.client_id) AS clients_count,
             COUNT(DISTINCT ct.id) AS contracts_count,
             COALESCE(SUM(
               CASE
                 WHEN ct.total_neto > 0 THEN (ci.qty_plants * ci.unit_price) * (ct.total_neto_usd / ct.total_neto)
                 WHEN ct.fx_rate_to_usd IS NOT NULL AND ct.fx_rate_to_usd > 0
                   THEN (ci.qty_plants * ci.unit_price) * ct.fx_rate_to_usd
                 WHEN ct.currency::text = 'USD' THEN ci.qty_plants * ci.unit_price
                 ELSE 0
               END
             ), 0) AS billing_usd
      FROM public.contract_items ci
      JOIN public.contracts ct ON ct.id = ci.contract_id
      LEFT JOIN public.clients c ON c.id = ct.client_id
      WHERE ci.deleted_at IS NULL AND ct.deleted_at IS NULL
        AND ct.condition = 'venta'
        AND public._mcp_contract_status_match(p_status_filter, ct.status::text)
        AND ci.delivery_year = p_year
        AND ci.unit_price IS NOT NULL AND ci.unit_price > 0
        AND (p_country_id IS NULL OR c.country_id = p_country_id)
        AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
    ) t),
    'by_month', COALESCE((SELECT jsonb_agg(to_jsonb(m) ORDER BY m.month) FROM (
      SELECT
        m.month,
        COALESCE(SUM(ci.qty_plants), 0) AS plants,
        COUNT(DISTINCT ct.client_id) AS clients_count,
        COALESCE(SUM(
          CASE
            WHEN ct.total_neto > 0 THEN (ci.qty_plants * ci.unit_price) * (ct.total_neto_usd / ct.total_neto)
            WHEN ct.fx_rate_to_usd IS NOT NULL AND ct.fx_rate_to_usd > 0
              THEN (ci.qty_plants * ci.unit_price) * ct.fx_rate_to_usd
            WHEN ct.currency::text = 'USD' THEN ci.qty_plants * ci.unit_price
            ELSE 0
          END
        ), 0) AS billing_usd,
        -- Drill-down por cliente dentro del mes
        COALESCE((
          SELECT jsonb_agg(to_jsonb(d) ORDER BY d.billing_usd DESC NULLS LAST) FROM (
            SELECT c2.id AS client_id, c2.name AS client_name,
                   co.iso2 AS country_iso2, co.name_es AS country_name,
                   SUM(ci2.qty_plants) AS plants,
                   SUM(
                     CASE
                       WHEN ct2.total_neto > 0 THEN (ci2.qty_plants * ci2.unit_price) * (ct2.total_neto_usd / ct2.total_neto)
                       WHEN ct2.fx_rate_to_usd IS NOT NULL AND ct2.fx_rate_to_usd > 0
                         THEN (ci2.qty_plants * ci2.unit_price) * ct2.fx_rate_to_usd
                       WHEN ct2.currency::text = 'USD' THEN ci2.qty_plants * ci2.unit_price
                       ELSE 0
                     END
                   ) AS billing_usd
            FROM public.contract_items ci2
            JOIN public.contracts ct2 ON ct2.id = ci2.contract_id
            JOIN public.clients c2 ON c2.id = ct2.client_id
            LEFT JOIN public.countries co ON co.id = c2.country_id
            WHERE ci2.deleted_at IS NULL AND ct2.deleted_at IS NULL
              AND ct2.condition = 'venta'
              AND public._mcp_contract_status_match(p_status_filter, ct2.status::text)
              AND ci2.delivery_year = p_year
              AND COALESCE(ci2.delivery_month, EXTRACT(MONTH FROM to_date(ci2.delivery_year::text || LPAD(ci2.delivery_week::text, 2, '0'), 'IYYYIW'))::integer) = m.month
              AND ci2.unit_price IS NOT NULL AND ci2.unit_price > 0
              AND (p_country_id IS NULL OR c2.country_id = p_country_id)
              AND (p_kam_id IS NULL OR ct2.kam_id = p_kam_id)
            GROUP BY c2.id, c2.name, co.iso2, co.name_es
          ) d
        ), '[]'::jsonb) AS by_client
      FROM generate_series(1, 12) AS m(month)
      LEFT JOIN public.contract_items ci ON ci.delivery_year = p_year
        AND COALESCE(ci.delivery_month, EXTRACT(MONTH FROM to_date(ci.delivery_year::text || LPAD(ci.delivery_week::text, 2, '0'), 'IYYYIW'))::integer) = m.month
        AND ci.deleted_at IS NULL
        AND ci.unit_price IS NOT NULL AND ci.unit_price > 0
      LEFT JOIN public.contracts ct ON ct.id = ci.contract_id AND ct.deleted_at IS NULL
        AND ct.condition = 'venta'
        AND public._mcp_contract_status_match(p_status_filter, ct.status::text)
      LEFT JOIN public.clients c ON c.id = ct.client_id
      WHERE (ci.id IS NULL OR (
        (p_country_id IS NULL OR c.country_id = p_country_id)
        AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
      ))
      GROUP BY m.month
    ) m), '[]'::jsonb)
  );
END; $$;

REVOKE ALL ON FUNCTION public.mcp_forecast_by_month(uuid, integer, uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_forecast_by_month(uuid, integer, uuid, uuid, text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
