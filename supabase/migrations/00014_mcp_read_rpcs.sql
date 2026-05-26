-- ============================================================
-- 00014_mcp_read_rpcs.sql
--
-- Read tools del MCP. Todas SECURITY DEFINER + reciben p_user_id
-- (resuelto del bearer token) como primer parámetro. Validan con
-- `_mcp_require_active(p_user_id)` y luego consultan.
--
-- Devuelven jsonb para flexibilidad — el route handler en JS hace
-- pass-through al cliente MCP que se lo presenta a Claude.
-- ============================================================

BEGIN;

-- ============================================================
-- Helper: valida usuario activo y devuelve el rol.
-- ============================================================
CREATE OR REPLACE FUNCTION public._mcp_require_active(p_user_id uuid)
RETURNS public.user_role
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_role public.user_role;
  v_active boolean;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Falta user_id.' USING ERRCODE = '42501';
  END IF;
  SELECT role, is_active INTO v_role, v_active
    FROM public.app_users
    WHERE id = p_user_id AND deleted_at IS NULL;
  IF v_role IS NULL OR v_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END;
$$;

REVOKE ALL ON FUNCTION public._mcp_require_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mcp_require_active(uuid) TO anon, authenticated;

-- ============================================================
-- mcp_search: cross-entity search (mirrors ⌘K)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_search(
  p_user_id uuid,
  p_query text,
  p_limit integer DEFAULT 5
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_pattern text;
  v_limit integer := LEAST(GREATEST(p_limit, 1), 20);
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  IF p_query IS NULL OR length(trim(p_query)) < 2 THEN
    RETURN jsonb_build_object('clientes', '[]'::jsonb, 'contratos', '[]'::jsonb, 'oportunidades', '[]'::jsonb, 'variedades', '[]'::jsonb);
  END IF;
  v_pattern := '%' || replace(replace(trim(p_query), '%', '\%'), '_', '\_') || '%';

  RETURN jsonb_build_object(
    'clientes', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'country_id', c.country_id))
      FROM (
        SELECT id, name, country_id FROM public.clients
        WHERE deleted_at IS NULL AND name ILIKE v_pattern
        ORDER BY name LIMIT v_limit
      ) c
    ), '[]'::jsonb),
    'contratos', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', ct.id, 'number', ct.number, 'status', ct.status::text, 'client_id', ct.client_id))
      FROM (
        SELECT id, number, status, client_id FROM public.contracts
        WHERE deleted_at IS NULL AND number ILIKE v_pattern
        ORDER BY number LIMIT v_limit
      ) ct
    ), '[]'::jsonb),
    'oportunidades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'stage_id', o.stage_id))
      FROM (
        SELECT id, name, stage_id FROM public.opportunities
        WHERE deleted_at IS NULL AND name ILIKE v_pattern
        ORDER BY name LIMIT v_limit
      ) o
    ), '[]'::jsonb),
    'variedades', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('id', v.id, 'name', v.name, 'species_id', v.species_id))
      FROM (
        SELECT id, name, species_id FROM public.varieties
        WHERE deleted_at IS NULL AND name ILIKE v_pattern
        ORDER BY name LIMIT v_limit
      ) v
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_search(uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_search(uuid, text, integer) TO anon, authenticated;

-- ============================================================
-- mcp_list_clients
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_list_clients(
  p_user_id uuid,
  p_search text DEFAULT NULL,
  p_country_id uuid DEFAULT NULL,
  p_kam_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(p_limit, 1), 100);
  v_offset integer := GREATEST(p_offset, 0);
  v_pattern text;
  v_total integer;
  v_rows jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  v_pattern := CASE WHEN p_search IS NOT NULL AND length(trim(p_search)) > 0
    THEN '%' || replace(replace(trim(p_search), '%', '\%'), '_', '\_') || '%'
    ELSE NULL END;

  SELECT COUNT(*) INTO v_total
    FROM public.clients c
    WHERE c.deleted_at IS NULL
      AND (v_pattern IS NULL OR c.name ILIKE v_pattern OR c.legal_name ILIKE v_pattern)
      AND (p_country_id IS NULL OR c.country_id = p_country_id)
      AND (p_kam_id IS NULL OR c.account_owner_id = p_kam_id);

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      c.id,
      c.name,
      c.legal_name,
      c.tax_id,
      c.country_id,
      co.name_es AS country_name,
      co.iso2 AS country_iso2,
      c.account_owner_id AS kam_id,
      au.full_name AS kam_name,
      c.is_active,
      c.created_at
    FROM public.clients c
    LEFT JOIN public.countries co ON co.id = c.country_id
    LEFT JOIN public.app_users au ON au.id = c.account_owner_id
    WHERE c.deleted_at IS NULL
      AND (v_pattern IS NULL OR c.name ILIKE v_pattern OR c.legal_name ILIKE v_pattern)
      AND (p_country_id IS NULL OR c.country_id = p_country_id)
      AND (p_kam_id IS NULL OR c.account_owner_id = p_kam_id)
    ORDER BY c.name
    LIMIT v_limit OFFSET v_offset
  ) r;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_clients(uuid, text, uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_clients(uuid, text, uuid, uuid, integer, integer) TO anon, authenticated;

-- ============================================================
-- mcp_get_client (con contacts + contracts summary)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_get_client(
  p_user_id uuid,
  p_client_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_client jsonb;
  v_contacts jsonb;
  v_contracts jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);

  SELECT to_jsonb(r) INTO v_client FROM (
    SELECT c.id, c.name, c.legal_name, c.tax_id, c.giro, c.region, c.notes, c.is_active,
           c.country_id, co.name_es AS country_name, co.iso2 AS country_iso2,
           c.account_owner_id AS kam_id, au.full_name AS kam_name, au.email::text AS kam_email,
           c.created_at, c.updated_at
    FROM public.clients c
    LEFT JOIN public.countries co ON co.id = c.country_id
    LEFT JOIN public.app_users au ON au.id = c.account_owner_id
    WHERE c.id = p_client_id AND c.deleted_at IS NULL
  ) r;

  IF v_client IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(cc) ORDER BY cc.is_primary DESC, cc.name), '[]'::jsonb)
    INTO v_contacts
  FROM (
    SELECT id, name, role, email::text AS email, phone, is_primary, notes
    FROM public.client_contacts
    WHERE client_id = p_client_id AND deleted_at IS NULL
  ) cc;

  SELECT COALESCE(jsonb_agg(to_jsonb(ct) ORDER BY ct.signed_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_contracts
  FROM (
    SELECT id, number, status::text AS status, currency::text AS currency,
           signed_at, total_neto, total_neto_usd, kam_id
    FROM public.contracts
    WHERE client_id = p_client_id AND deleted_at IS NULL
    LIMIT 50
  ) ct;

  RETURN v_client || jsonb_build_object('contacts', v_contacts, 'contracts', v_contracts);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_get_client(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_get_client(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- mcp_list_contracts
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_list_contracts(
  p_user_id uuid,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_year integer DEFAULT NULL,
  p_kam_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(p_limit, 1), 100);
  v_offset integer := GREATEST(p_offset, 0);
  v_pattern text;
  v_total integer;
  v_rows jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  v_pattern := CASE WHEN p_search IS NOT NULL AND length(trim(p_search)) > 0
    THEN '%' || replace(replace(trim(p_search), '%', '\%'), '_', '\_') || '%'
    ELSE NULL END;

  SELECT COUNT(*) INTO v_total
    FROM public.contracts ct
    LEFT JOIN public.clients c ON c.id = ct.client_id
    WHERE ct.deleted_at IS NULL
      AND (v_pattern IS NULL OR ct.number ILIKE v_pattern OR c.name ILIKE v_pattern)
      AND (p_status IS NULL OR ct.status::text = p_status)
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
      AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
      AND (p_client_id IS NULL OR ct.client_id = p_client_id);

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.signed_at DESC NULLS LAST), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      ct.id,
      ct.number,
      ct.status::text AS status,
      ct.condition::text AS condition,
      ct.sale_type::text AS sale_type,
      ct.currency::text AS currency,
      ct.fx_rate_to_usd,
      ct.signed_at,
      ct.total_neto,
      ct.total_neto_usd,
      ct.client_id,
      c.name AS client_name,
      c.country_id,
      co.name_es AS country_name,
      ct.kam_id,
      au.full_name AS kam_name
    FROM public.contracts ct
    LEFT JOIN public.clients c ON c.id = ct.client_id
    LEFT JOIN public.countries co ON co.id = c.country_id
    LEFT JOIN public.app_users au ON au.id = ct.kam_id
    WHERE ct.deleted_at IS NULL
      AND (v_pattern IS NULL OR ct.number ILIKE v_pattern OR c.name ILIKE v_pattern)
      AND (p_status IS NULL OR ct.status::text = p_status)
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
      AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
      AND (p_client_id IS NULL OR ct.client_id = p_client_id)
    ORDER BY ct.signed_at DESC NULLS LAST
    LIMIT v_limit OFFSET v_offset
  ) r;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_contracts(uuid, text, text, integer, uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_contracts(uuid, text, text, integer, uuid, uuid, integer, integer) TO anon, authenticated;

-- ============================================================
-- mcp_get_contract (con items + payments + deliveries)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_get_contract(
  p_user_id uuid,
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contract jsonb;
  v_items jsonb;
  v_payments jsonb;
  v_deliveries jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);

  SELECT to_jsonb(r) INTO v_contract FROM (
    SELECT ct.id, ct.number, ct.status::text AS status, ct.condition::text AS condition,
           ct.sale_type::text AS sale_type, ct.currency::text AS currency,
           ct.fx_rate_to_usd, ct.incoterm, ct.signed_at, ct.notes,
           ct.total_neto, ct.total_iva, ct.total_neto_usd,
           ct.client_id, c.name AS client_name,
           ct.kam_id, au.full_name AS kam_name,
           ct.source_opportunity_id, ct.created_at, ct.updated_at
    FROM public.contracts ct
    LEFT JOIN public.clients c ON c.id = ct.client_id
    LEFT JOIN public.app_users au ON au.id = ct.kam_id
    WHERE ct.id = p_contract_id AND ct.deleted_at IS NULL
  ) r;

  IF v_contract IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.delivery_year, i.delivery_week), '[]'::jsonb)
    INTO v_items
  FROM (
    SELECT ci.id, ci.variety_id, v.name AS variety_name,
           s.name AS species_name,
           ci.qty_plants, ci.qty_delivered,
           ci.format, ci.material_type::text AS material_type,
           ci.unit_price, ci.currency::text AS currency,
           ci.delivery_year, ci.delivery_week, ci.delivery_month,
           ci.status::text AS status, ci.notes
    FROM public.contract_items ci
    LEFT JOIN public.varieties v ON v.id = ci.variety_id
    LEFT JOIN public.species s ON s.id = v.species_id
    WHERE ci.contract_id = p_contract_id AND ci.deleted_at IS NULL
  ) i;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.due_date NULLS LAST), '[]'::jsonb)
    INTO v_payments
  FROM (
    SELECT id, type::text AS type, amount, iva, currency::text AS currency,
           status::text AS status, due_date, paid_at, reference
    FROM public.payments
    WHERE contract_id = p_contract_id AND deleted_at IS NULL
  ) p;

  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.delivered_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_deliveries
  FROM (
    SELECT del.id, del.contract_item_id, del.qty_delivered, del.delivered_at,
           del.remito_number, del.notes
    FROM public.deliveries del
    JOIN public.contract_items ci ON ci.id = del.contract_item_id
    WHERE ci.contract_id = p_contract_id AND del.deleted_at IS NULL
  ) d;

  RETURN v_contract || jsonb_build_object('items', v_items, 'payments', v_payments, 'deliveries', v_deliveries);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_get_contract(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_get_contract(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- mcp_list_opportunities
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_list_opportunities(
  p_user_id uuid,
  p_stage_id uuid DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(p_limit, 1), 200);
  v_offset integer := GREATEST(p_offset, 0);
  v_total integer;
  v_rows jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);

  SELECT COUNT(*) INTO v_total
    FROM public.opportunities o
    WHERE o.deleted_at IS NULL
      AND (p_stage_id IS NULL OR o.stage_id = p_stage_id)
      AND (p_owner_id IS NULL OR o.owner_id = p_owner_id)
      AND (p_client_id IS NULL OR o.client_id = p_client_id);

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.expected_close_date NULLS LAST), '[]'::jsonb)
    INTO v_rows
  FROM (
    SELECT o.id, o.name, o.client_id, COALESCE(c.name, o.client_name_raw) AS client_name,
           o.stage_id, st.name AS stage_name, st.order_index AS stage_order,
           st.is_won, st.is_lost,
           o.owner_id, au.full_name AS owner_name,
           o.probability_pct, o.expected_close_date,
           o.currency::text AS currency, o.estimated_value, o.estimated_value_usd,
           o.lost_reason, o.created_at, o.updated_at
    FROM public.opportunities o
    LEFT JOIN public.clients c ON c.id = o.client_id
    LEFT JOIN public.opportunity_stages st ON st.id = o.stage_id
    LEFT JOIN public.app_users au ON au.id = o.owner_id
    WHERE o.deleted_at IS NULL
      AND (p_stage_id IS NULL OR o.stage_id = p_stage_id)
      AND (p_owner_id IS NULL OR o.owner_id = p_owner_id)
      AND (p_client_id IS NULL OR o.client_id = p_client_id)
    ORDER BY o.expected_close_date NULLS LAST
    LIMIT v_limit OFFSET v_offset
  ) r;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_opportunities(uuid, uuid, uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_opportunities(uuid, uuid, uuid, uuid, integer, integer) TO anon, authenticated;

-- ============================================================
-- mcp_get_opportunity
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_get_opportunity(
  p_user_id uuid,
  p_opportunity_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);

  SELECT to_jsonb(r) INTO v_row FROM (
    SELECT o.*,
           COALESCE(c.name, o.client_name_raw) AS client_name,
           st.name AS stage_name, st.is_won, st.is_lost,
           au.full_name AS owner_name
    FROM public.opportunities o
    LEFT JOIN public.clients c ON c.id = o.client_id
    LEFT JOIN public.opportunity_stages st ON st.id = o.stage_id
    LEFT JOIN public.app_users au ON au.id = o.owner_id
    WHERE o.id = p_opportunity_id AND o.deleted_at IS NULL
  ) r;

  RETURN v_row;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_get_opportunity(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_get_opportunity(uuid, uuid) TO anon, authenticated;

-- ============================================================
-- mcp_list_varieties
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_list_varieties(
  p_user_id uuid,
  p_search text DEFAULT NULL,
  p_species_id uuid DEFAULT NULL,
  p_program_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(p_limit, 1), 200);
  v_offset integer := GREATEST(p_offset, 0);
  v_pattern text;
  v_total integer;
  v_rows jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  v_pattern := CASE WHEN p_search IS NOT NULL AND length(trim(p_search)) > 0
    THEN '%' || replace(replace(trim(p_search), '%', '\%'), '_', '\_') || '%'
    ELSE NULL END;

  SELECT COUNT(*) INTO v_total
    FROM public.varieties v
    WHERE v.deleted_at IS NULL
      AND (v_pattern IS NULL OR v.name ILIKE v_pattern)
      AND (p_species_id IS NULL OR v.species_id = p_species_id)
      AND (p_program_id IS NULL OR v.genetic_program_id = p_program_id);

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT v.id, v.name, v.is_active, v.royalty_per_plant,
           v.species_id, s.name AS species_name,
           v.genetic_program_id, gp.name AS program_name, gp.owner AS program_owner
    FROM public.varieties v
    LEFT JOIN public.species s ON s.id = v.species_id
    LEFT JOIN public.genetic_programs gp ON gp.id = v.genetic_program_id
    WHERE v.deleted_at IS NULL
      AND (v_pattern IS NULL OR v.name ILIKE v_pattern)
      AND (p_species_id IS NULL OR v.species_id = p_species_id)
      AND (p_program_id IS NULL OR v.genetic_program_id = p_program_id)
    ORDER BY v.name
    LIMIT v_limit OFFSET v_offset
  ) r;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_varieties(uuid, text, uuid, uuid, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_varieties(uuid, text, uuid, uuid, integer, integer) TO anon, authenticated;

-- ============================================================
-- mcp_list_payments (cross-contract por status/cliente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_list_payments(
  p_user_id uuid,
  p_contract_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(p_limit, 1), 200);
  v_offset integer := GREATEST(p_offset, 0);
  v_total integer;
  v_rows jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);

  SELECT COUNT(*) INTO v_total
    FROM public.payments p
    JOIN public.contracts ct ON ct.id = p.contract_id
    WHERE p.deleted_at IS NULL
      AND (p_contract_id IS NULL OR p.contract_id = p_contract_id)
      AND (p_client_id IS NULL OR ct.client_id = p_client_id)
      AND (p_status IS NULL OR p.status::text = p_status);

  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.due_date NULLS LAST), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT p.id, p.contract_id, ct.number AS contract_number,
           ct.client_id, c.name AS client_name,
           p.type::text AS type, p.amount, p.iva, p.currency::text AS currency,
           p.status::text AS status, p.due_date, p.paid_at, p.reference
    FROM public.payments p
    JOIN public.contracts ct ON ct.id = p.contract_id
    LEFT JOIN public.clients c ON c.id = ct.client_id
    WHERE p.deleted_at IS NULL
      AND (p_contract_id IS NULL OR p.contract_id = p_contract_id)
      AND (p_client_id IS NULL OR ct.client_id = p_client_id)
      AND (p_status IS NULL OR p.status::text = p_status)
    ORDER BY p.due_date NULLS LAST
    LIMIT v_limit OFFSET v_offset
  ) r;

  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_payments(uuid, uuid, uuid, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_payments(uuid, uuid, uuid, text, integer, integer) TO anon, authenticated;

-- ============================================================
-- mcp_list_opportunity_stages (helper para clientes MCP)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_list_opportunity_stages(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', st.id, 'name', st.name, 'order_index', st.order_index,
      'probability_default', st.probability_default, 'is_won', st.is_won, 'is_lost', st.is_lost
    ) ORDER BY st.order_index)
    FROM public.opportunity_stages st
    WHERE st.deleted_at IS NULL
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_opportunity_stages(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_opportunity_stages(uuid) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
