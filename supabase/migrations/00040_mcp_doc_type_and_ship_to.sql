-- Propaga doc_type (contrato/orden_compra/venta_spot) y ship_to_client_id
-- (despacho a un cliente distinto del que paga) a los RPCs del MCP.
--
-- Cambian de firma (se agregan parámetros) → DROP + CREATE:
--   mcp_list_contracts        + p_doc_type (filtro) y doc_type/ship_to en filas
--   mcp_create_contract_draft + p_doc_type, p_ship_to_client_id
--   mcp_update_contract       + p_doc_type, p_ship_to_client_id
-- Misma firma → CREATE OR REPLACE:
--   mcp_get_contract          + doc_type, ship_to (contrato y entregas)
--
-- Este archivo contiene el SQL completo (fuente de verdad), aplicado también
-- vía Supabase MCP apply_migration.

-- ---------------------------------------------------------------------------
-- mcp_get_contract
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mcp_get_contract(p_user_id uuid, p_contract_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_contract jsonb; v_items jsonb; v_payments jsonb; v_deliveries jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  SELECT to_jsonb(r) INTO v_contract FROM (
    SELECT ct.id, ct.number, ct.status::text AS status, ct.condition::text AS condition,
           ct.doc_type::text AS doc_type, ct.sale_type::text AS sale_type,
           ct.currency::text AS currency, ct.fx_rate_to_usd, ct.incoterm, ct.signed_at, ct.notes,
           ct.total_neto, ct.total_iva, ct.total_neto_usd, ct.client_id, c.name AS client_name,
           ct.ship_to_client_id, stc.name AS ship_to_client_name,
           ct.kam_id, au.full_name AS kam_name, ct.source_opportunity_id, ct.created_at, ct.updated_at
    FROM public.contracts ct
    LEFT JOIN public.clients c ON c.id = ct.client_id
    LEFT JOIN public.clients stc ON stc.id = ct.ship_to_client_id
    LEFT JOIN public.app_users au ON au.id = ct.kam_id
    WHERE ct.id = p_contract_id AND ct.deleted_at IS NULL) r;
  IF v_contract IS NULL THEN RETURN NULL; END IF;
  SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.delivery_year, i.delivery_week), '[]'::jsonb) INTO v_items FROM (
    SELECT ci.id, ci.variety_id, v.name AS variety_name, s.name AS species_name,
           ci.qty_plants, ci.qty_delivered, ci.format, ci.material_type::text AS material_type,
           ci.unit_price, ci.currency::text AS currency, ci.delivery_year, ci.delivery_week, ci.delivery_month,
           ci.status::text AS status, ci.notes
    FROM public.contract_items ci LEFT JOIN public.varieties v ON v.id = ci.variety_id LEFT JOIN public.species s ON s.id = v.species_id
    WHERE ci.contract_id = p_contract_id AND ci.deleted_at IS NULL) i;
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.due_date NULLS LAST), '[]'::jsonb) INTO v_payments FROM (
    SELECT id, type::text AS type, amount, iva, currency::text AS currency, status::text AS status, due_date, paid_at, reference
    FROM public.payments WHERE contract_id = p_contract_id AND deleted_at IS NULL) p;
  SELECT COALESCE(jsonb_agg(to_jsonb(d) ORDER BY d.delivered_at DESC NULLS LAST), '[]'::jsonb) INTO v_deliveries FROM (
    SELECT del.id, del.contract_item_id, del.qty_delivered, del.delivered_at, del.remito_number, del.notes,
           del.ship_to_client_id, sdc.name AS ship_to_client_name, del.ship_to_address
    FROM public.deliveries del
    JOIN public.contract_items ci ON ci.id = del.contract_item_id
    LEFT JOIN public.clients sdc ON sdc.id = del.ship_to_client_id
    WHERE ci.contract_id = p_contract_id AND del.deleted_at IS NULL) d;
  RETURN v_contract || jsonb_build_object('items', v_items, 'payments', v_payments, 'deliveries', v_deliveries);
END; $function$;

-- ---------------------------------------------------------------------------
-- mcp_list_contracts (+ p_doc_type)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mcp_list_contracts(uuid, text, text, integer, uuid, uuid, integer, integer);

CREATE FUNCTION public.mcp_list_contracts(
  p_user_id uuid,
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_year integer DEFAULT NULL,
  p_kam_id uuid DEFAULT NULL,
  p_client_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_doc_type text DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_limit integer := LEAST(GREATEST(p_limit, 1), 100); v_offset integer := GREATEST(p_offset, 0); v_pattern text; v_total integer; v_rows jsonb;
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  v_pattern := CASE WHEN p_search IS NOT NULL AND length(trim(p_search)) > 0 THEN '%' || replace(replace(trim(p_search), '%', '\%'), '_', '\_') || '%' ELSE NULL END;
  SELECT COUNT(*) INTO v_total FROM public.contracts ct LEFT JOIN public.clients c ON c.id = ct.client_id
    WHERE ct.deleted_at IS NULL
      AND (v_pattern IS NULL OR ct.number ILIKE v_pattern OR c.name ILIKE v_pattern)
      AND (p_status IS NULL OR ct.status::text = p_status)
      AND (p_doc_type IS NULL OR ct.doc_type::text = p_doc_type)
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
      AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
      AND (p_client_id IS NULL OR ct.client_id = p_client_id);
  SELECT COALESCE(jsonb_agg(to_jsonb(r) ORDER BY r.signed_at DESC NULLS LAST), '[]'::jsonb) INTO v_rows FROM (
    SELECT ct.id, ct.number, ct.status::text AS status, ct.condition::text AS condition,
           ct.doc_type::text AS doc_type, ct.sale_type::text AS sale_type,
           ct.currency::text AS currency, ct.fx_rate_to_usd, ct.signed_at, ct.total_neto, ct.total_neto_usd,
           ct.client_id, c.name AS client_name, c.country_id, co.name_es AS country_name,
           ct.ship_to_client_id, stc.name AS ship_to_client_name,
           ct.kam_id, au.full_name AS kam_name
    FROM public.contracts ct
    LEFT JOIN public.clients c ON c.id = ct.client_id
    LEFT JOIN public.clients stc ON stc.id = ct.ship_to_client_id
    LEFT JOIN public.countries co ON co.id = c.country_id
    LEFT JOIN public.app_users au ON au.id = ct.kam_id
    WHERE ct.deleted_at IS NULL
      AND (v_pattern IS NULL OR ct.number ILIKE v_pattern OR c.name ILIKE v_pattern)
      AND (p_status IS NULL OR ct.status::text = p_status)
      AND (p_doc_type IS NULL OR ct.doc_type::text = p_doc_type)
      AND (p_year IS NULL OR EXTRACT(YEAR FROM ct.signed_at) = p_year)
      AND (p_kam_id IS NULL OR ct.kam_id = p_kam_id)
      AND (p_client_id IS NULL OR ct.client_id = p_client_id)
    ORDER BY ct.signed_at DESC NULLS LAST LIMIT v_limit OFFSET v_offset) r;
  RETURN jsonb_build_object('total', v_total, 'limit', v_limit, 'offset', v_offset, 'rows', v_rows);
END; $function$;

-- ---------------------------------------------------------------------------
-- mcp_create_contract_draft (+ p_doc_type, p_ship_to_client_id)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mcp_create_contract_draft(uuid, uuid, text, jsonb, text, text, text, text, uuid);

CREATE FUNCTION public.mcp_create_contract_draft(
  p_user_id uuid,
  p_client_id uuid,
  p_currency text,
  p_items jsonb,
  p_sale_type text DEFAULT NULL,
  p_condition text DEFAULT 'venta',
  p_incoterm text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_organization_id uuid DEFAULT NULL,
  p_doc_type text DEFAULT 'contrato',
  p_ship_to_client_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_id uuid;
  v_org_id uuid;
  v_prefix text;
  v_number text;
  v_item jsonb;
  v_total numeric := 0;
  v_doc_type public.commercial_doc_type;
  v_status public.contract_status;
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
  IF p_ship_to_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients WHERE clients.id = p_ship_to_client_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cliente de despacho no encontrado.' USING ERRCODE = '42704';
  END IF;

  v_doc_type := COALESCE(NULLIF(p_doc_type, ''), 'contrato')::public.commercial_doc_type;
  -- Venta spot no pasa por firma: nace directo en ejecución.
  v_status := CASE WHEN v_doc_type = 'venta_spot' THEN 'en_proceso' ELSE 'borrador' END::public.contract_status;

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
  -- Número único: PREFIX-YEAR-MCP{epoch}
  v_number := v_prefix || '-' || EXTRACT(YEAR FROM now())::text || '-MCP' || EXTRACT(EPOCH FROM now())::bigint::text;

  INSERT INTO public.contracts (
    number, client_id, organization_id, status, currency, condition, doc_type,
    ship_to_client_id, sale_type, incoterm, notes, total_neto, created_by, updated_by
  ) VALUES (
    v_number, p_client_id, v_org_id, v_status,
    p_currency::public.currency_code,
    COALESCE(p_condition, 'venta')::public.condition_type,
    v_doc_type,
    NULLIF(p_ship_to_client_id::text, p_client_id::text)::uuid,
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
END; $function$;

-- ---------------------------------------------------------------------------
-- mcp_update_contract (+ p_doc_type, p_ship_to_client_id)
-- Nota: p_ship_to_client_id usa COALESCE, así que no permite "limpiar" el
-- despacho a NULL vía MCP; eso se hace desde la app.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.mcp_update_contract(uuid, uuid, text, text, text, date, uuid, text, text);

CREATE FUNCTION public.mcp_update_contract(
  p_user_id uuid,
  p_contract_id uuid,
  p_status text DEFAULT NULL,
  p_condition text DEFAULT NULL,
  p_sale_type text DEFAULT NULL,
  p_signed_at date DEFAULT NULL,
  p_kam_id uuid DEFAULT NULL,
  p_incoterm text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_doc_type text DEFAULT NULL,
  p_ship_to_client_id uuid DEFAULT NULL
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_affected int;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  IF p_ship_to_client_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.clients WHERE clients.id = p_ship_to_client_id AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Cliente de despacho no encontrado.' USING ERRCODE = '42704';
  END IF;
  UPDATE public.contracts SET
    status = COALESCE(p_status::public.contract_status, status),
    condition = COALESCE(p_condition::public.condition_type, condition),
    doc_type = COALESCE(NULLIF(p_doc_type, '')::public.commercial_doc_type, doc_type),
    ship_to_client_id = COALESCE(p_ship_to_client_id, ship_to_client_id),
    sale_type = COALESCE(p_sale_type::public.sale_type, sale_type),
    signed_at = COALESCE(p_signed_at, signed_at), kam_id = COALESCE(p_kam_id, kam_id),
    incoterm = COALESCE(p_incoterm, incoterm), notes = COALESCE(p_notes, notes),
    updated_at = now(), updated_by = p_user_id
  WHERE id = p_contract_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '42704'; END IF;
  RETURN public.mcp_get_contract(p_user_id, p_contract_id);
END; $function$;

NOTIFY pgrst, 'reload schema';
