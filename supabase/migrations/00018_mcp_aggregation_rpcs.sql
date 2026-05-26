-- ============================================================
-- 00018_mcp_aggregation_rpcs.sql
--
-- Tools de agregación para el conector MCP. Cierran gaps que aparecieron
-- en walkthroughs reales: preguntas tipo "top X" o "cuánto vendió Y"
-- forzaban a Claude a paginar list_contracts varias veces y sumar a mano.
--
-- Todas SECURITY DEFINER + _mcp_require_active. Devuelven JSONB para
-- flexibilidad.
-- ============================================================

BEGIN;

-- ============================================================
-- kam_summary: panorama completo de un KAM
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_kam_summary(
  p_user_id uuid,
  p_kam_id uuid,
  p_year integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_kam jsonb;
  v_overall jsonb;
  v_by_status jsonb;
  v_top_clients jsonb;
  v_top_countries jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);

  SELECT to_jsonb(r) INTO v_kam FROM (
    SELECT id, full_name, email::text AS email, role::text AS role
    FROM public.app_users WHERE id = p_kam_id AND deleted_at IS NULL
  ) r;
  IF v_kam IS NULL THEN RETURN NULL; END IF;

  SELECT jsonb_build_object(
    'contracts_count', COUNT(*),
    'total_usd', COALESCE(SUM(total_neto_usd), 0),
    'plants_total', COALESCE((
      SELECT SUM(ci.qty_plants) FROM public.contract_items ci
      JOIN public.contracts ct ON ct.id = ci.contract_id
      WHERE ct.kam_id = p_kam_id AND ct.deleted_at IS NULL AND ci.deleted_at IS NULL
        AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
    ), 0)
  ) INTO v_overall
  FROM public.contracts
  WHERE kam_id = p_kam_id AND deleted_at IS NULL
    AND (p_year IS NULL OR EXTRACT(YEAR FROM signed_at) = p_year);

  SELECT COALESCE(jsonb_object_agg(status_label, jsonb_build_object('count', cnt, 'usd', usd)), '{}'::jsonb)
    INTO v_by_status
  FROM (
    SELECT status::text AS status_label, COUNT(*) AS cnt, COALESCE(SUM(total_neto_usd), 0) AS usd
    FROM public.contracts
    WHERE kam_id = p_kam_id AND deleted_at IS NULL
      AND (p_year IS NULL OR EXTRACT(YEAR FROM signed_at) = p_year)
    GROUP BY status
  ) s;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.total_usd DESC NULLS LAST), '[]'::jsonb)
    INTO v_top_clients
  FROM (
    SELECT c.id AS client_id, c.name AS client_name, COUNT(*) AS contracts_count,
           COALESCE(SUM(ct.total_neto_usd), 0) AS total_usd
    FROM public.contracts ct
    LEFT JOIN public.clients c ON c.id = ct.client_id
    WHERE ct.kam_id = p_kam_id AND ct.deleted_at IS NULL
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
    GROUP BY c.id, c.name
    ORDER BY total_usd DESC NULLS LAST LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.total_usd DESC NULLS LAST), '[]'::jsonb)
    INTO v_top_countries
  FROM (
    SELECT co.iso2 AS country_iso2, co.name_es AS country_name,
           COUNT(*) AS contracts_count, COALESCE(SUM(ct.total_neto_usd), 0) AS total_usd
    FROM public.contracts ct
    LEFT JOIN public.clients c ON c.id = ct.client_id
    LEFT JOIN public.countries co ON co.id = c.country_id
    WHERE ct.kam_id = p_kam_id AND ct.deleted_at IS NULL
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
    GROUP BY co.iso2, co.name_es
    ORDER BY total_usd DESC NULLS LAST LIMIT 10
  ) t;

  RETURN v_kam || jsonb_build_object(
    'year_filter', p_year,
    'overall', v_overall,
    'by_status', v_by_status,
    'top_clients', v_top_clients,
    'top_countries', v_top_countries
  );
END; $$;
REVOKE ALL ON FUNCTION public.mcp_kam_summary(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_kam_summary(uuid, uuid, integer) TO anon, authenticated;

-- ============================================================
-- top_kams: ranking de KAMs por métrica
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_top_kams(
  p_user_id uuid,
  p_metric text DEFAULT 'usd',          -- usd | contracts | plants
  p_year integer DEFAULT NULL,
  p_limit integer DEFAULT 10
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(p_limit, 1), 50);
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank_value DESC NULLS LAST) FROM (
    SELECT au.id, au.full_name, au.email::text AS email,
           COUNT(ct.*) AS contracts_count,
           COALESCE(SUM(ct.total_neto_usd), 0) AS total_usd,
           COALESCE(SUM(ci.qty_plants), 0) AS plants_total,
           CASE p_metric
             WHEN 'contracts' THEN COUNT(ct.*)::numeric
             WHEN 'plants'    THEN COALESCE(SUM(ci.qty_plants), 0)::numeric
             ELSE                  COALESCE(SUM(ct.total_neto_usd), 0)
           END AS rank_value
    FROM public.app_users au
    LEFT JOIN public.contracts ct ON ct.kam_id = au.id AND ct.deleted_at IS NULL
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
    LEFT JOIN public.contract_items ci ON ci.contract_id = ct.id AND ci.deleted_at IS NULL
    WHERE au.role = 'sales' AND au.is_active = true AND au.deleted_at IS NULL
    GROUP BY au.id, au.full_name, au.email
    ORDER BY rank_value DESC NULLS LAST
    LIMIT v_limit
  ) r), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.mcp_top_kams(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_top_kams(uuid, text, integer, integer) TO anon, authenticated;

-- ============================================================
-- top_clients: ranking de clientes por métrica
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_top_clients(
  p_user_id uuid,
  p_metric text DEFAULT 'usd',          -- usd | contracts | plants
  p_year integer DEFAULT NULL,
  p_status text DEFAULT NULL,           -- ej. 'firmado' para excluir borrador/cancelado
  p_limit integer DEFAULT 10
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(p_limit, 1), 100);
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank_value DESC NULLS LAST) FROM (
    SELECT c.id AS client_id, c.name AS client_name,
           c.country_id, co.name_es AS country_name, co.iso2 AS country_iso2,
           COUNT(ct.*) AS contracts_count,
           COALESCE(SUM(ct.total_neto_usd), 0) AS total_usd,
           COALESCE(SUM(ci.qty_plants), 0) AS plants_total,
           CASE p_metric
             WHEN 'contracts' THEN COUNT(ct.*)::numeric
             WHEN 'plants'    THEN COALESCE(SUM(ci.qty_plants), 0)::numeric
             ELSE                  COALESCE(SUM(ct.total_neto_usd), 0)
           END AS rank_value
    FROM public.clients c
    LEFT JOIN public.countries co ON co.id = c.country_id
    LEFT JOIN public.contracts ct ON ct.client_id = c.id AND ct.deleted_at IS NULL
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
      AND (p_status IS NULL OR ct.status::text = p_status)
    LEFT JOIN public.contract_items ci ON ci.contract_id = ct.id AND ci.deleted_at IS NULL
    WHERE c.deleted_at IS NULL
    GROUP BY c.id, c.name, c.country_id, co.name_es, co.iso2
    HAVING COUNT(ct.*) > 0
    ORDER BY rank_value DESC NULLS LAST
    LIMIT v_limit
  ) r), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.mcp_top_clients(uuid, text, integer, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_top_clients(uuid, text, integer, text, integer) TO anon, authenticated;

-- ============================================================
-- pipeline_summary: oportunidades agrupadas por stage
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_pipeline_summary(
  p_user_id uuid,
  p_year integer DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN jsonb_build_object(
    'by_stage', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.order_index) FROM (
      SELECT st.id AS stage_id, st.name AS stage_name, st.order_index, st.is_won, st.is_lost,
             COUNT(o.*) AS opportunities_count,
             COALESCE(SUM(o.estimated_value_usd), 0) AS total_estimated_usd,
             COALESCE(SUM(o.estimated_value_usd * o.probability_pct / 100.0), 0) AS weighted_usd
      FROM public.opportunity_stages st
      LEFT JOIN public.opportunities o ON o.stage_id = st.id AND o.deleted_at IS NULL
        AND (p_year IS NULL OR EXTRACT(YEAR FROM o.expected_close_date) = p_year)
        AND (p_owner_id IS NULL OR o.owner_id = p_owner_id)
      WHERE st.deleted_at IS NULL
      GROUP BY st.id, st.name, st.order_index, st.is_won, st.is_lost
    ) r), '[]'::jsonb),
    'totals', (SELECT to_jsonb(t) FROM (
      SELECT COUNT(*) AS opportunities_count,
             COALESCE(SUM(estimated_value_usd), 0) AS total_estimated_usd,
             COALESCE(SUM(estimated_value_usd * probability_pct / 100.0), 0) AS weighted_usd,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.opportunity_stages s WHERE s.id = opportunities.stage_id AND s.is_won)) AS won_count,
             COUNT(*) FILTER (WHERE EXISTS (SELECT 1 FROM public.opportunity_stages s WHERE s.id = opportunities.stage_id AND s.is_lost)) AS lost_count
      FROM public.opportunities
      WHERE deleted_at IS NULL
        AND (p_year IS NULL OR EXTRACT(YEAR FROM expected_close_date) = p_year)
        AND (p_owner_id IS NULL OR owner_id = p_owner_id)
    ) t)
  );
END; $$;
REVOKE ALL ON FUNCTION public.mcp_pipeline_summary(uuid, integer, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_pipeline_summary(uuid, integer, uuid) TO anon, authenticated;

-- ============================================================
-- contracts_overview: totales + breakdown agregado
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_contracts_overview(
  p_user_id uuid,
  p_year integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN jsonb_build_object(
    'year_filter', p_year,
    'totals', (SELECT to_jsonb(t) FROM (
      SELECT COUNT(*) AS contracts_count,
             COALESCE(SUM(total_neto_usd), 0) AS total_usd,
             COALESCE(SUM(total_neto_usd) FILTER (WHERE status = 'firmado'), 0) AS signed_usd,
             COUNT(*) FILTER (WHERE status = 'firmado') AS signed_count,
             COUNT(*) FILTER (WHERE status = 'borrador') AS draft_count,
             COUNT(*) FILTER (WHERE status = 'cancelado') AS cancelled_count
      FROM public.contracts
      WHERE deleted_at IS NULL
        AND (p_year IS NULL OR EXTRACT(YEAR FROM signed_at) = p_year)
    ) t),
    'by_status', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.usd DESC) FROM (
      SELECT status::text AS status, COUNT(*) AS count, COALESCE(SUM(total_neto_usd), 0) AS usd
      FROM public.contracts WHERE deleted_at IS NULL
        AND (p_year IS NULL OR EXTRACT(YEAR FROM signed_at) = p_year)
      GROUP BY status
    ) r), '[]'::jsonb),
    'by_condition', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.usd DESC) FROM (
      SELECT condition::text AS condition, COUNT(*) AS count, COALESCE(SUM(total_neto_usd), 0) AS usd
      FROM public.contracts WHERE deleted_at IS NULL
        AND (p_year IS NULL OR EXTRACT(YEAR FROM signed_at) = p_year)
      GROUP BY condition
    ) r), '[]'::jsonb),
    'by_sale_type', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.usd DESC) FROM (
      SELECT sale_type::text AS sale_type, COUNT(*) AS count, COALESCE(SUM(total_neto_usd), 0) AS usd
      FROM public.contracts WHERE deleted_at IS NULL
        AND (p_year IS NULL OR EXTRACT(YEAR FROM signed_at) = p_year)
      GROUP BY sale_type
    ) r), '[]'::jsonb),
    'by_year', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.year DESC) FROM (
      SELECT EXTRACT(YEAR FROM signed_at)::integer AS year,
             COUNT(*) AS count, COALESCE(SUM(total_neto_usd), 0) AS usd
      FROM public.contracts
      WHERE deleted_at IS NULL AND signed_at IS NOT NULL
      GROUP BY EXTRACT(YEAR FROM signed_at)
    ) r), '[]'::jsonb)
  );
END; $$;
REVOKE ALL ON FUNCTION public.mcp_contracts_overview(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_contracts_overview(uuid, integer) TO anon, authenticated;

-- ============================================================
-- payments_overview: cobrado, pendiente, vencido
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_payments_overview(
  p_user_id uuid,
  p_year integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN jsonb_build_object(
    'year_filter', p_year,
    'totals', (SELECT to_jsonb(t) FROM (
      SELECT COUNT(*) AS payments_count,
             COALESCE(SUM(amount), 0) AS total_amount,
             COALESCE(SUM(amount) FILTER (WHERE status = 'pagado'), 0) AS paid_amount,
             COALESCE(SUM(amount) FILTER (WHERE status = 'pendiente'), 0) AS pending_amount,
             COALESCE(SUM(amount) FILTER (WHERE status = 'vencido'), 0) AS overdue_amount,
             COUNT(*) FILTER (WHERE status = 'pagado') AS paid_count,
             COUNT(*) FILTER (WHERE status = 'pendiente') AS pending_count,
             COUNT(*) FILTER (WHERE status = 'vencido') AS overdue_count
      FROM public.payments
      WHERE deleted_at IS NULL
        AND (p_year IS NULL OR EXTRACT(YEAR FROM COALESCE(paid_at, due_date)) = p_year)
    ) t),
    'by_currency', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.amount DESC) FROM (
      SELECT currency::text AS currency,
             COUNT(*) AS count,
             COALESCE(SUM(amount), 0) AS amount,
             COALESCE(SUM(amount) FILTER (WHERE status = 'pagado'), 0) AS paid_amount
      FROM public.payments WHERE deleted_at IS NULL
        AND (p_year IS NULL OR EXTRACT(YEAR FROM COALESCE(paid_at, due_date)) = p_year)
      GROUP BY currency
    ) r), '[]'::jsonb)
  );
END; $$;
REVOKE ALL ON FUNCTION public.mcp_payments_overview(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_payments_overview(uuid, integer) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
