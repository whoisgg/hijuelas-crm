-- ============================================================
-- 00015_mcp_write_rpcs.sql
--
-- Write tools del MCP. Mismo patrón que las read RPCs:
--  - SECURITY DEFINER
--  - reciben p_user_id como primer parámetro
--  - validan con _mcp_require_active y exigen role IN ('admin','mcp_editor')
--
-- Incluye una tabla nueva `contract_notes` para que el rol mcp_editor
-- pueda dejar anotaciones contextuales en contratos sin tocar el campo
-- `contracts.notes` (que es un free-text edit-anywhere).
-- ============================================================

BEGIN;

-- ============================================================
-- contract_notes (timeline de anotaciones internas)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.contract_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES public.app_users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS contract_notes_contract_id_idx
  ON public.contract_notes(contract_id)
  WHERE deleted_at IS NULL;

ALTER TABLE public.contract_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS contract_notes_read_authenticated ON public.contract_notes;
CREATE POLICY contract_notes_read_authenticated ON public.contract_notes
  FOR SELECT TO authenticated USING (deleted_at IS NULL);

DROP POLICY IF EXISTS contract_notes_no_direct_write ON public.contract_notes;
CREATE POLICY contract_notes_no_direct_write ON public.contract_notes
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ============================================================
-- Helper: requiere rol con escritura (admin o mcp_editor)
-- ============================================================
CREATE OR REPLACE FUNCTION public._mcp_require_writer(p_user_id uuid)
RETURNS public.user_role
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_role public.user_role;
BEGIN
  v_role := public._mcp_require_active(p_user_id);
  IF v_role::text NOT IN ('admin','mcp_editor') THEN
    RAISE EXCEPTION 'Rol % no autorizado a escribir vía MCP.', v_role::text USING ERRCODE = '42501';
  END IF;
  RETURN v_role;
END; $$;

REVOKE ALL ON FUNCTION public._mcp_require_writer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mcp_require_writer(uuid) TO anon, authenticated;

-- ============================================================
-- mcp_create_opportunity
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_create_opportunity(
  p_user_id uuid,
  p_name text,
  p_client_id uuid DEFAULT NULL,
  p_client_name_raw text DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL,
  p_expected_close_date date DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_estimated_value numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_id uuid;
  v_stage_id uuid := p_stage_id;
  v_probability numeric;
  v_org_id uuid;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'El nombre de la oportunidad es obligatorio.' USING ERRCODE = '22023';
  END IF;
  SELECT organization_id INTO v_org_id FROM public.app_users WHERE id = p_user_id;
  IF v_org_id IS NULL THEN
    SELECT id INTO v_org_id FROM public.organizations WHERE active = true ORDER BY created_at LIMIT 1;
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'No se pudo resolver organization_id.' USING ERRCODE = '23502';
  END IF;
  -- Default stage = la primera (menor order_index) si no se provee.
  IF v_stage_id IS NULL THEN
    SELECT id INTO v_stage_id FROM public.opportunity_stages WHERE deleted_at IS NULL ORDER BY order_index LIMIT 1;
  END IF;
  SELECT probability_default INTO v_probability FROM public.opportunity_stages WHERE id = v_stage_id;

  INSERT INTO public.opportunities (
    organization_id, name, client_id, client_name_raw, stage_id, owner_id,
    probability_pct, expected_close_date, currency, estimated_value, notes,
    created_by, updated_by
  ) VALUES (
    v_org_id,
    trim(p_name),
    p_client_id,
    p_client_name_raw,
    v_stage_id,
    COALESCE(p_owner_id, p_user_id),
    v_probability,
    p_expected_close_date,
    p_currency::public.currency_code,
    p_estimated_value,
    p_notes,
    p_user_id,
    p_user_id
  ) RETURNING id INTO v_id;

  RETURN public.mcp_get_opportunity(p_user_id, v_id);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_create_opportunity(uuid, text, uuid, text, uuid, uuid, date, text, numeric, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_create_opportunity(uuid, text, uuid, text, uuid, uuid, date, text, numeric, text) TO anon, authenticated;

-- ============================================================
-- mcp_update_opportunity (campos editables)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_update_opportunity(
  p_user_id uuid,
  p_opportunity_id uuid,
  p_name text DEFAULT NULL,
  p_stage_id uuid DEFAULT NULL,
  p_owner_id uuid DEFAULT NULL,
  p_expected_close_date date DEFAULT NULL,
  p_probability_pct numeric DEFAULT NULL,
  p_estimated_value numeric DEFAULT NULL,
  p_currency text DEFAULT NULL,
  p_lost_reason text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_affected int;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  UPDATE public.opportunities SET
    name = COALESCE(p_name, name),
    stage_id = COALESCE(p_stage_id, stage_id),
    owner_id = COALESCE(p_owner_id, owner_id),
    expected_close_date = COALESCE(p_expected_close_date, expected_close_date),
    probability_pct = COALESCE(p_probability_pct, probability_pct),
    estimated_value = COALESCE(p_estimated_value, estimated_value),
    currency = COALESCE(p_currency::public.currency_code, currency),
    lost_reason = COALESCE(p_lost_reason, lost_reason),
    notes = COALESCE(p_notes, notes),
    updated_at = now(),
    updated_by = p_user_id
  WHERE id = p_opportunity_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Oportunidad no encontrada.' USING ERRCODE = '42704';
  END IF;
  RETURN public.mcp_get_opportunity(p_user_id, p_opportunity_id);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_update_opportunity(uuid, uuid, text, uuid, uuid, date, numeric, numeric, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_update_opportunity(uuid, uuid, text, uuid, uuid, date, numeric, numeric, text, text, text) TO anon, authenticated;

-- ============================================================
-- mcp_move_opportunity_stage (helper específico)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_move_opportunity_stage(
  p_user_id uuid,
  p_opportunity_id uuid,
  p_stage_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_probability numeric; v_affected int;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  SELECT probability_default INTO v_probability FROM public.opportunity_stages WHERE id = p_stage_id AND deleted_at IS NULL;
  IF v_probability IS NULL THEN
    RAISE EXCEPTION 'Stage inválido.' USING ERRCODE = '42704';
  END IF;
  UPDATE public.opportunities
    SET stage_id = p_stage_id, probability_pct = v_probability, updated_at = now(), updated_by = p_user_id
    WHERE id = p_opportunity_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Oportunidad no encontrada.' USING ERRCODE = '42704';
  END IF;
  RETURN public.mcp_get_opportunity(p_user_id, p_opportunity_id);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_move_opportunity_stage(uuid, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_move_opportunity_stage(uuid, uuid, uuid) TO anon, authenticated;

-- ============================================================
-- mcp_register_payment
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_register_payment(
  p_user_id uuid,
  p_contract_id uuid,
  p_type text,
  p_amount numeric,
  p_currency text,
  p_iva numeric DEFAULT 0,
  p_due_date date DEFAULT NULL,
  p_paid_at date DEFAULT NULL,
  p_reference text DEFAULT NULL,
  p_status text DEFAULT 'pendiente'
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  IF p_contract_id IS NULL OR p_amount IS NULL OR p_type IS NULL OR p_currency IS NULL THEN
    RAISE EXCEPTION 'contract_id, type, amount y currency son obligatorios.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '42704';
  END IF;
  INSERT INTO public.payments (
    contract_id, type, amount, iva, currency, status, due_date, paid_at, reference, created_by, updated_by
  ) VALUES (
    p_contract_id,
    p_type::public.payment_type,
    p_amount,
    COALESCE(p_iva, 0),
    p_currency::public.currency_code,
    p_status::public.payment_status,
    p_due_date,
    p_paid_at,
    p_reference,
    p_user_id,
    p_user_id
  ) RETURNING id INTO v_id;

  RETURN (SELECT to_jsonb(r) FROM (
    SELECT id, contract_id, type::text AS type, amount, iva, currency::text AS currency,
           status::text AS status, due_date, paid_at, reference, created_at
    FROM public.payments WHERE id = v_id
  ) r);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_register_payment(uuid, uuid, text, numeric, text, numeric, date, date, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_register_payment(uuid, uuid, text, numeric, text, numeric, date, date, text, text) TO anon, authenticated;

-- ============================================================
-- mcp_create_client
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_create_client(
  p_user_id uuid,
  p_name text,
  p_country_id uuid DEFAULT NULL,
  p_legal_name text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_giro text DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_account_owner_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'name es obligatorio.' USING ERRCODE = '22023';
  END IF;
  INSERT INTO public.clients (
    name, legal_name, tax_id, giro, country_id, region, account_owner_id, notes,
    created_by, updated_by
  ) VALUES (
    trim(p_name), p_legal_name, p_tax_id, p_giro, p_country_id, p_region, p_account_owner_id, p_notes,
    p_user_id, p_user_id
  ) RETURNING id INTO v_id;
  RETURN public.mcp_get_client(p_user_id, v_id);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_create_client(uuid, text, uuid, text, text, text, text, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_create_client(uuid, text, uuid, text, text, text, text, uuid, text) TO anon, authenticated;

-- ============================================================
-- mcp_update_client
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_update_client(
  p_user_id uuid,
  p_client_id uuid,
  p_name text DEFAULT NULL,
  p_legal_name text DEFAULT NULL,
  p_tax_id text DEFAULT NULL,
  p_giro text DEFAULT NULL,
  p_country_id uuid DEFAULT NULL,
  p_region text DEFAULT NULL,
  p_account_owner_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_is_active boolean DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_affected int;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  UPDATE public.clients SET
    name = COALESCE(p_name, name),
    legal_name = COALESCE(p_legal_name, legal_name),
    tax_id = COALESCE(p_tax_id, tax_id),
    giro = COALESCE(p_giro, giro),
    country_id = COALESCE(p_country_id, country_id),
    region = COALESCE(p_region, region),
    account_owner_id = COALESCE(p_account_owner_id, account_owner_id),
    notes = COALESCE(p_notes, notes),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = now(),
    updated_by = p_user_id
  WHERE id = p_client_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Cliente no encontrado.' USING ERRCODE = '42704';
  END IF;
  RETURN public.mcp_get_client(p_user_id, p_client_id);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_update_client(uuid, uuid, text, text, text, text, uuid, text, uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_update_client(uuid, uuid, text, text, text, text, uuid, text, uuid, text, boolean) TO anon, authenticated;

-- ============================================================
-- mcp_update_contract (restringido a metadata, no items)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_update_contract(
  p_user_id uuid,
  p_contract_id uuid,
  p_status text DEFAULT NULL,
  p_condition text DEFAULT NULL,
  p_sale_type text DEFAULT NULL,
  p_signed_at date DEFAULT NULL,
  p_kam_id uuid DEFAULT NULL,
  p_incoterm text DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_affected int;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  UPDATE public.contracts SET
    status = COALESCE(p_status::public.contract_status, status),
    condition = COALESCE(p_condition::public.condition_type, condition),
    sale_type = COALESCE(p_sale_type::public.sale_type, sale_type),
    signed_at = COALESCE(p_signed_at, signed_at),
    kam_id = COALESCE(p_kam_id, kam_id),
    incoterm = COALESCE(p_incoterm, incoterm),
    notes = COALESCE(p_notes, notes),
    updated_at = now(),
    updated_by = p_user_id
  WHERE id = p_contract_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '42704';
  END IF;
  RETURN public.mcp_get_contract(p_user_id, p_contract_id);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_update_contract(uuid, uuid, text, text, text, date, uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_update_contract(uuid, uuid, text, text, text, date, uuid, text, text) TO anon, authenticated;

-- ============================================================
-- mcp_add_contract_note
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_add_contract_note(
  p_user_id uuid,
  p_contract_id uuid,
  p_body text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._mcp_require_writer(p_user_id);
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RAISE EXCEPTION 'body no puede estar vacío.' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '42704';
  END IF;
  INSERT INTO public.contract_notes (contract_id, author_id, body)
    VALUES (p_contract_id, p_user_id, trim(p_body))
    RETURNING id INTO v_id;
  RETURN (SELECT to_jsonb(r) FROM (
    SELECT cn.id, cn.contract_id, cn.author_id, au.full_name AS author_name,
           cn.body, cn.created_at
    FROM public.contract_notes cn LEFT JOIN public.app_users au ON au.id = cn.author_id
    WHERE cn.id = v_id
  ) r);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_add_contract_note(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_add_contract_note(uuid, uuid, text) TO anon, authenticated;

-- ============================================================
-- mcp_list_contract_notes (read pareado, no requiere writer)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_list_contract_notes(
  p_user_id uuid,
  p_contract_id uuid,
  p_limit integer DEFAULT 50
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_limit integer := LEAST(GREATEST(p_limit, 1), 200);
BEGIN
  PERFORM public._mcp_require_active(p_user_id);
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id', cn.id, 'body', cn.body, 'created_at', cn.created_at,
      'author_id', cn.author_id, 'author_name', au.full_name
    ) ORDER BY cn.created_at DESC)
    FROM public.contract_notes cn LEFT JOIN public.app_users au ON au.id = cn.author_id
    WHERE cn.contract_id = p_contract_id AND cn.deleted_at IS NULL
    LIMIT v_limit
  ), '[]'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.mcp_list_contract_notes(uuid, uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_contract_notes(uuid, uuid, integer) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
