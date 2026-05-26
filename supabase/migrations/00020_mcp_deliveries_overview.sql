-- ============================================================
-- 00020_mcp_deliveries_overview.sql
--
-- Vista cross-contract de entregas por ventana de tiempo + filtros.
-- Hueco que apareció en uso real: el detalle de entregas vivía dentro
-- de cada contrato, así que "cuántas plantas entregamos en junio"
-- forzaba a abrir 129 contratos uno por uno. Con esto, 1 call.
--
-- Filtros: year (obligatorio), month, week_from/week_to, country, kam,
-- client. Flag `only_pending` para excluir items ya entregados al 100%.
--
-- Devuelve totales agregados + breakdown por variety / client / country /
-- week, más los items detallados (cap 100) para drill-down inmediato.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mcp_deliveries_overview(
  p_user_id uuid,
  p_year integer,
  p_month integer DEFAULT NULL,
  p_week_from integer DEFAULT NULL,
  p_week_to integer DEFAULT NULL,
  p_country_id uuid DEFAULT NULL,
  p_kam_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_only_pending boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_pending_filter boolean := COALESCE(p_only_pending, false);
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  IF p_year IS NULL THEN
    RAISE EXCEPTION 'p_year es obligatorio.' USING ERRCODE = '22023';
  END IF;

  RETURN jsonb_build_object(
    'filter', jsonb_build_object(
      'year', p_year, 'month', p_month,
      'week_from', p_week_from, 'week_to', p_week_to,
      'country_id', p_country_id, 'kam_id', p_kam_id, 'client_id', p_client_id,
      'only_pending', v_pending_filter
    ),
    'totals', (SELECT to_jsonb(t) FROM (
      SELECT COUNT(*) AS items_count,
             COUNT(DISTINCT ct.id) AS contracts_count,
             COUNT(DISTINCT ct.client_id) AS clients_count,
             COALESCE(SUM(ci.qty_plants), 0) AS plants_total,
             COALESCE(SUM(GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0)), 0) AS plants_pending,
             COALESCE(SUM(ci.qty_delivered), 0) AS plants_delivered
      FROM public.contract_items ci
      JOIN public.contracts ct ON ct.id = ci.contract_id AND ct.deleted_at IS NULL
        AND ct.status::text <> 'cancelado'
      LEFT JOIN public.clients c ON c.id = ct.client_id
      WHERE ci.deleted_at IS NULL
        AND ci.delivery_year = p_year
        AND (p_month IS NULL OR ci.delivery_month = p_month)
        AND (p_week_from IS NULL OR ci.delivery_week >= p_week_from)
        AND (p_week_to IS NULL OR ci.delivery_week <= p_week_to)
        AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
        AND (p_client_id IS NULL OR ct.client_id = p_client_id)
        AND (p_country_id IS NULL OR c.country_id = p_country_id)
        AND (NOT v_pending_filter OR GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0) > 0)
    ) t),
    'by_variety', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.plants DESC) FROM (
      SELECT v.id AS variety_id, v.name AS variety_name, s.name AS species_name,
             COALESCE(SUM(ci.qty_plants), 0) AS plants,
             COALESCE(SUM(GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0)), 0) AS plants_pending
      FROM public.contract_items ci
      JOIN public.contracts ct ON ct.id = ci.contract_id AND ct.deleted_at IS NULL AND ct.status::text <> 'cancelado'
      LEFT JOIN public.clients c ON c.id = ct.client_id
      LEFT JOIN public.varieties v ON v.id = ci.variety_id
      LEFT JOIN public.species s ON s.id = v.species_id
      WHERE ci.deleted_at IS NULL
        AND ci.delivery_year = p_year
        AND (p_month IS NULL OR ci.delivery_month = p_month)
        AND (p_week_from IS NULL OR ci.delivery_week >= p_week_from)
        AND (p_week_to IS NULL OR ci.delivery_week <= p_week_to)
        AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
        AND (p_client_id IS NULL OR ct.client_id = p_client_id)
        AND (p_country_id IS NULL OR c.country_id = p_country_id)
        AND (NOT v_pending_filter OR GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0) > 0)
      GROUP BY v.id, v.name, s.name LIMIT 50
    ) r), '[]'::jsonb),
    'by_client', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.plants DESC) FROM (
      SELECT c.id AS client_id, c.name AS client_name, co.iso2 AS country_iso2,
             COALESCE(SUM(ci.qty_plants), 0) AS plants,
             COALESCE(SUM(GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0)), 0) AS plants_pending
      FROM public.contract_items ci
      JOIN public.contracts ct ON ct.id = ci.contract_id AND ct.deleted_at IS NULL AND ct.status::text <> 'cancelado'
      LEFT JOIN public.clients c ON c.id = ct.client_id
      LEFT JOIN public.countries co ON co.id = c.country_id
      WHERE ci.deleted_at IS NULL
        AND ci.delivery_year = p_year
        AND (p_month IS NULL OR ci.delivery_month = p_month)
        AND (p_week_from IS NULL OR ci.delivery_week >= p_week_from)
        AND (p_week_to IS NULL OR ci.delivery_week <= p_week_to)
        AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
        AND (p_client_id IS NULL OR ct.client_id = p_client_id)
        AND (p_country_id IS NULL OR c.country_id = p_country_id)
        AND (NOT v_pending_filter OR GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0) > 0)
      GROUP BY c.id, c.name, co.iso2 LIMIT 50
    ) r), '[]'::jsonb),
    'by_country', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.plants DESC) FROM (
      SELECT co.iso2 AS country_iso2, co.name_es AS country_name,
             COALESCE(SUM(ci.qty_plants), 0) AS plants,
             COALESCE(SUM(GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0)), 0) AS plants_pending
      FROM public.contract_items ci
      JOIN public.contracts ct ON ct.id = ci.contract_id AND ct.deleted_at IS NULL AND ct.status::text <> 'cancelado'
      LEFT JOIN public.clients c ON c.id = ct.client_id
      LEFT JOIN public.countries co ON co.id = c.country_id
      WHERE ci.deleted_at IS NULL
        AND ci.delivery_year = p_year
        AND (p_month IS NULL OR ci.delivery_month = p_month)
        AND (p_week_from IS NULL OR ci.delivery_week >= p_week_from)
        AND (p_week_to IS NULL OR ci.delivery_week <= p_week_to)
        AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
        AND (p_client_id IS NULL OR ct.client_id = p_client_id)
        AND (p_country_id IS NULL OR c.country_id = p_country_id)
        AND (NOT v_pending_filter OR GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0) > 0)
      GROUP BY co.iso2, co.name_es
    ) r), '[]'::jsonb),
    'by_week', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.delivery_year, r.delivery_week NULLS LAST) FROM (
      SELECT ci.delivery_year, ci.delivery_week, ci.delivery_month,
             COALESCE(SUM(ci.qty_plants), 0) AS plants,
             COALESCE(SUM(GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0)), 0) AS plants_pending,
             COUNT(*) AS items_count
      FROM public.contract_items ci
      JOIN public.contracts ct ON ct.id = ci.contract_id AND ct.deleted_at IS NULL AND ct.status::text <> 'cancelado'
      LEFT JOIN public.clients c ON c.id = ct.client_id
      WHERE ci.deleted_at IS NULL
        AND ci.delivery_year = p_year
        AND (p_month IS NULL OR ci.delivery_month = p_month)
        AND (p_week_from IS NULL OR ci.delivery_week >= p_week_from)
        AND (p_week_to IS NULL OR ci.delivery_week <= p_week_to)
        AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
        AND (p_client_id IS NULL OR ct.client_id = p_client_id)
        AND (p_country_id IS NULL OR c.country_id = p_country_id)
        AND (NOT v_pending_filter OR GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0) > 0)
      GROUP BY ci.delivery_year, ci.delivery_week, ci.delivery_month
    ) r), '[]'::jsonb),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.delivery_year, r.delivery_week NULLS LAST) FROM (
      SELECT ci.id, ct.number AS contract_number, ct.id AS contract_id,
             c.id AS client_id, c.name AS client_name, co.iso2 AS country_iso2,
             v.name AS variety_name, s.name AS species_name,
             ci.qty_plants, ci.qty_delivered,
             GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0) AS qty_pending,
             ci.delivery_year, ci.delivery_week, ci.delivery_month,
             ci.status::text AS status
      FROM public.contract_items ci
      JOIN public.contracts ct ON ct.id = ci.contract_id AND ct.deleted_at IS NULL AND ct.status::text <> 'cancelado'
      LEFT JOIN public.clients c ON c.id = ct.client_id
      LEFT JOIN public.countries co ON co.id = c.country_id
      LEFT JOIN public.varieties v ON v.id = ci.variety_id
      LEFT JOIN public.species s ON s.id = v.species_id
      WHERE ci.deleted_at IS NULL
        AND ci.delivery_year = p_year
        AND (p_month IS NULL OR ci.delivery_month = p_month)
        AND (p_week_from IS NULL OR ci.delivery_week >= p_week_from)
        AND (p_week_to IS NULL OR ci.delivery_week <= p_week_to)
        AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
        AND (p_client_id IS NULL OR ct.client_id = p_client_id)
        AND (p_country_id IS NULL OR c.country_id = p_country_id)
        AND (NOT v_pending_filter OR GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered,0), 0) > 0)
      LIMIT 100
    ) r), '[]'::jsonb)
  );
END; $$;

REVOKE ALL ON FUNCTION public.mcp_deliveries_overview(uuid, integer, integer, integer, integer, uuid, uuid, uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_deliveries_overview(uuid, integer, integer, integer, integer, uuid, uuid, uuid, boolean) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
