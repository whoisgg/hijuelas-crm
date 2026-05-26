-- ============================================================
-- 00021_mcp_more_aggregations_and_draft.sql
--
-- 4 read tools + 1 write tool pedidos en uso real:
--   1) clients_with_unpaid — quién no ha pagado
--   2) upcoming_payments   — a quién le toca pagar pronto
--   3) top_varieties       — ranking de variedades
--   4) top_countries       — ranking de países
--   5) create_contract_draft — borrador de contrato (write, gated)
--
-- Las read RPCs siguen el patrón existente. La write usa el mismo
-- _mcp_require_writer y resuelve organization_id del caller. Genera
-- número de contrato con formato {PREFIX}-{YEAR}-MCP{epoch} para no
-- colisionar con la secuencia humana.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mcp_clients_with_unpaid(
  p_user_id uuid,
  p_only_overdue boolean DEFAULT false,
  p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_limit integer := LEAST(GREATEST(p_limit, 1), 200);
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.pending_amount DESC NULLS LAST) FROM (
    SELECT c.id AS client_id, c.name AS client_name, co.iso2 AS country_iso2, co.name_es AS country_name,
           au.full_name AS kam_name,
           COUNT(p.*) AS payments_count,
           COUNT(p.*) FILTER (WHERE p.status = 'vencido') AS overdue_count,
           COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('pendiente','vencido')), 0) AS pending_amount,
           COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'vencido'), 0) AS overdue_amount,
           MIN(p.due_date) FILTER (WHERE p.status IN ('pendiente','vencido')) AS next_due_date
    FROM public.payments p
    JOIN public.contracts ct ON ct.id = p.contract_id AND ct.deleted_at IS NULL AND ct.status::text <> 'cancelado'
    JOIN public.clients c ON c.id = ct.client_id AND c.deleted_at IS NULL
    LEFT JOIN public.countries co ON co.id = c.country_id
    LEFT JOIN public.app_users au ON au.id = ct.kam_id
    WHERE p.deleted_at IS NULL AND p.status IN ('pendiente','vencido')
    GROUP BY c.id, c.name, co.iso2, co.name_es, au.full_name
    HAVING (NOT p_only_overdue OR COUNT(*) FILTER (WHERE p.status = 'vencido') > 0)
    ORDER BY pending_amount DESC NULLS LAST LIMIT v_limit
  ) r), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.mcp_clients_with_unpaid(uuid, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_clients_with_unpaid(uuid, boolean, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mcp_upcoming_payments(
  p_user_id uuid,
  p_days_ahead integer DEFAULT 30,
  p_include_overdue boolean DEFAULT true,
  p_limit integer DEFAULT 100
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(p_limit, 1), 500);
  v_horizon date := (now() + (p_days_ahead || ' days')::interval)::date;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN jsonb_build_object(
    'horizon_date', v_horizon,
    'totals', (SELECT to_jsonb(t) FROM (
      SELECT COUNT(*) AS payments_count,
             COALESCE(SUM(p.amount), 0) AS total_amount,
             COUNT(*) FILTER (WHERE p.status = 'vencido') AS overdue_count,
             COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'vencido'), 0) AS overdue_amount
      FROM public.payments p
      JOIN public.contracts ct ON ct.id = p.contract_id AND ct.deleted_at IS NULL AND ct.status::text <> 'cancelado'
      WHERE p.deleted_at IS NULL
        AND p.due_date <= v_horizon
        AND (
          (p.status = 'pendiente' AND p.due_date >= CURRENT_DATE)
          OR (p_include_overdue AND p.status = 'vencido')
          OR (p_include_overdue AND p.status = 'pendiente' AND p.due_date < CURRENT_DATE)
        )
    ) t),
    'items', COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.due_date) FROM (
      SELECT p.id, p.contract_id, ct.number AS contract_number,
             c.id AS client_id, c.name AS client_name, co.iso2 AS country_iso2,
             au.full_name AS kam_name,
             p.type::text AS type, p.amount, p.currency::text AS currency,
             p.status::text AS status, p.due_date,
             (CURRENT_DATE - p.due_date) AS days_overdue
      FROM public.payments p
      JOIN public.contracts ct ON ct.id = p.contract_id AND ct.deleted_at IS NULL AND ct.status::text <> 'cancelado'
      LEFT JOIN public.clients c ON c.id = ct.client_id
      LEFT JOIN public.countries co ON co.id = c.country_id
      LEFT JOIN public.app_users au ON au.id = ct.kam_id
      WHERE p.deleted_at IS NULL
        AND p.due_date <= v_horizon
        AND (
          (p.status = 'pendiente' AND p.due_date >= CURRENT_DATE)
          OR (p_include_overdue AND p.status = 'vencido')
          OR (p_include_overdue AND p.status = 'pendiente' AND p.due_date < CURRENT_DATE)
        )
      LIMIT v_limit
    ) r), '[]'::jsonb)
  );
END; $$;
REVOKE ALL ON FUNCTION public.mcp_upcoming_payments(uuid, integer, boolean, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_upcoming_payments(uuid, integer, boolean, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mcp_top_varieties(
  p_user_id uuid,
  p_metric text DEFAULT 'plants',
  p_year integer DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_limit integer := LEAST(GREATEST(p_limit, 1), 100);
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank_value DESC NULLS LAST) FROM (
    SELECT v.id AS variety_id, v.name AS variety_name, s.name AS species_name,
           gp.name AS program_name,
           COALESCE(SUM(ci.qty_plants), 0) AS plants_total,
           COALESCE(SUM(ci.qty_delivered), 0) AS plants_delivered,
           COUNT(DISTINCT ci.contract_id) AS contracts_count,
           COUNT(DISTINCT ct.client_id) AS clients_count,
           CASE p_metric
             WHEN 'contracts' THEN COUNT(DISTINCT ci.contract_id)::numeric
             WHEN 'clients'   THEN COUNT(DISTINCT ct.client_id)::numeric
             ELSE              COALESCE(SUM(ci.qty_plants), 0)::numeric
           END AS rank_value
    FROM public.varieties v
    LEFT JOIN public.species s ON s.id = v.species_id
    LEFT JOIN public.genetic_programs gp ON gp.id = v.genetic_program_id
    LEFT JOIN public.contract_items ci ON ci.variety_id = v.id AND ci.deleted_at IS NULL
    LEFT JOIN public.contracts ct ON ct.id = ci.contract_id AND ct.deleted_at IS NULL
      AND ct.status::text <> 'cancelado'
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year OR ci.delivery_year = p_year)
    WHERE v.deleted_at IS NULL
    GROUP BY v.id, v.name, s.name, gp.name
    HAVING COUNT(ci.*) > 0
    ORDER BY rank_value DESC NULLS LAST LIMIT v_limit
  ) r), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.mcp_top_varieties(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_top_varieties(uuid, text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mcp_top_countries(
  p_user_id uuid,
  p_metric text DEFAULT 'usd',
  p_year integer DEFAULT NULL,
  p_limit integer DEFAULT 20
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_limit integer := LEAST(GREATEST(p_limit, 1), 100);
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.rank_value DESC NULLS LAST) FROM (
    SELECT co.id AS country_id, co.iso2 AS country_iso2, co.name_es AS country_name,
           COUNT(DISTINCT ct.id) AS contracts_count,
           COUNT(DISTINCT c.id) AS clients_count,
           COALESCE(SUM(ct.total_neto_usd), 0) AS total_usd,
           COALESCE(SUM(ci.qty_plants), 0) AS plants_total,
           CASE p_metric
             WHEN 'contracts' THEN COUNT(DISTINCT ct.id)::numeric
             WHEN 'clients'   THEN COUNT(DISTINCT c.id)::numeric
             WHEN 'plants'    THEN COALESCE(SUM(ci.qty_plants), 0)::numeric
             ELSE              COALESCE(SUM(ct.total_neto_usd), 0)
           END AS rank_value
    FROM public.countries co
    LEFT JOIN public.clients c ON c.country_id = co.id AND c.deleted_at IS NULL
    LEFT JOIN public.contracts ct ON ct.client_id = c.id AND ct.deleted_at IS NULL
      AND ct.status::text <> 'cancelado'
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
    LEFT JOIN public.contract_items ci ON ci.contract_id = ct.id AND ci.deleted_at IS NULL
    WHERE co.deleted_at IS NULL
    GROUP BY co.id, co.iso2, co.name_es
    HAVING COUNT(DISTINCT ct.id) > 0
    ORDER BY rank_value DESC NULLS LAST LIMIT v_limit
  ) r), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.mcp_top_countries(uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_top_countries(uuid, text, integer, integer) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.mcp_create_contract_draft(
  p_user_id uuid,
  p_client_id uuid,
  p_currency text,
  p_items jsonb,
  p_sale_type text DEFAULT NULL,
  p_condition text DEFAULT 'venta',
  p_incoterm text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  v_id uuid;
  v_org_id uuid;
  v_prefix text;
  v_number text;
  v_item jsonb;
  v_total numeric := 0;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  IF p_client_id IS NULL OR p_currency IS NULL THEN
    RAISE EXCEPTION 'client_id y currency son obligatorios.' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Debes pasar al menos 1 item en p_items.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE clients.id = p_client_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cliente no encontrado.' USING ERRCODE = '42704';
  END IF;

  v_org_id := p_organization_id;
  IF v_org_id IS NULL THEN
    SELECT organization_id INTO v_org_id FROM public.app_users WHERE app_users.id = p_user_id;
    IF v_org_id IS NULL THEN
      SELECT id INTO v_org_id FROM public.organizations WHERE active = true ORDER BY created_at LIMIT 1;
    END IF;
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver organization_id.' USING ERRCODE = '23502';
  END IF;
  SELECT contract_prefix INTO v_prefix FROM public.organizations WHERE id = v_org_id;
  v_prefix := COALESCE(v_prefix, 'MCP');
  v_number := v_prefix || '-' || EXTRACT(YEAR FROM now())::text || '-MCP' || EXTRACT(EPOCH FROM now())::bigint::text;

  INSERT INTO public.contracts (
    number, client_id, organization_id, status, currency, condition, sale_type,
    incoterm, notes, total_neto, created_by, updated_by
  ) VALUES (
    v_number, p_client_id, v_org_id, 'borrador'::public.contract_status,
    p_currency::public.currency_code,
    COALESCE(p_condition, 'venta')::public.condition_type,
    NULLIF(p_sale_type, '')::public.sale_type,
    p_incoterm, p_notes, 0, p_user_id, p_user_id
  ) RETURNING id INTO v_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.contract_items (
      contract_id, variety_id, qty_plants, unit_price, currency, format,
      material_type, delivery_year, delivery_week, delivery_month, notes,
      created_by, updated_by
    ) VALUES (
      v_id,
      (v_item->>'variety_id')::uuid,
      COALESCE((v_item->>'qty_plants')::integer, 0),
      NULLIF(v_item->>'unit_price', '')::numeric,
      p_currency::public.currency_code,
      v_item->>'format',
      NULLIF(v_item->>'material_type', '')::public.material_type,
      NULLIF(v_item->>'delivery_year', '')::integer,
      NULLIF(v_item->>'delivery_week', '')::integer,
      NULLIF(v_item->>'delivery_month', '')::integer,
      v_item->>'notes',
      p_user_id, p_user_id
    );
    v_total := v_total + COALESCE((v_item->>'qty_plants')::numeric, 0) * COALESCE((v_item->>'unit_price')::numeric, 0);
  END LOOP;

  UPDATE public.contracts SET total_neto = v_total WHERE id = v_id;

  RETURN public.mcp_get_contract(p_user_id, v_id);
END; $$;
REVOKE ALL ON FUNCTION public.mcp_create_contract_draft(uuid, uuid, text, jsonb, text, text, text, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_create_contract_draft(uuid, uuid, text, jsonb, text, text, text, text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
