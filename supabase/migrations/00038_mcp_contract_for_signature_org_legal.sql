-- ============================================================
-- 00038_mcp_contract_for_signature_org_legal.sql
--
-- Extiende mcp_contract_for_signature (00036) para incluir los datos legales de
-- la organización vendedora (columnas agregadas en 00037), así el MCP genera el
-- contrato con el vendedor correcto por organización.
-- ============================================================

CREATE OR REPLACE FUNCTION public.mcp_contract_for_signature(
  p_user_id uuid,
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contract jsonb;
  v_items jsonb;
  v_payments jsonb;
  v_buyer jsonb;
  v_client_id uuid;
BEGIN
  PERFORM public._mcp_require_signer(p_user_id);

  SELECT to_jsonb(r) INTO v_contract FROM (
    SELECT ct.id, ct.number, ct.status::text AS status, ct.currency::text AS currency,
           ct.total_neto, ct.total_iva, ct.total_neto_usd, ct.signed_at, ct.client_id,
           cl.name AS client_name, cl.legal_name AS client_legal_name, cl.tax_id AS client_tax_id,
           cl.giro AS client_giro, cl.region AS client_region,
           og.name AS org_name, og.legal_name AS org_legal_name, og.tax_id AS org_tax_id,
           og.legal_representative_name AS org_rep_name, og.legal_representative_id AS org_rep_id,
           og.legal_domicile AS org_domicile, og.bank_name AS org_bank_name,
           og.bank_account AS org_bank_account, og.notice_name AS org_notice_name,
           og.notice_email AS org_notice_email, og.signer_email AS org_signer_email
    FROM public.contracts ct
    LEFT JOIN public.clients cl ON cl.id = ct.client_id
    LEFT JOIN public.organizations og ON og.id = ct.organization_id
    WHERE ct.id = p_contract_id AND ct.deleted_at IS NULL
  ) r;
  IF v_contract IS NULL THEN RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '42704'; END IF;
  v_client_id := (v_contract->>'client_id')::uuid;

  SELECT COALESCE(jsonb_agg(to_jsonb(it) ORDER BY it.created_at), '[]'::jsonb) INTO v_items FROM (
    SELECT vr.name AS variety_name, sp.name AS species_name,
           ci.qty_plants, ci.unit_price, ci.currency::text AS currency,
           ci.delivery_year, ci.delivery_week, ci.created_at
    FROM public.contract_items ci
    LEFT JOIN public.varieties vr ON vr.id = ci.variety_id
    LEFT JOIN public.species sp ON sp.id = vr.species_id
    WHERE ci.contract_id = p_contract_id AND ci.deleted_at IS NULL
  ) it;

  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.due_date NULLS LAST), '[]'::jsonb) INTO v_payments FROM (
    SELECT py.type::text AS type, py.amount, py.currency::text AS currency, py.due_date
    FROM public.payments py
    WHERE py.contract_id = p_contract_id AND py.deleted_at IS NULL
  ) p;

  SELECT to_jsonb(b) INTO v_buyer FROM (
    SELECT
      (SELECT cc.email::text FROM public.client_contacts cc
        WHERE cc.client_id = v_client_id AND cc.deleted_at IS NULL AND cc.email IS NOT NULL
        ORDER BY cc.is_primary DESC NULLS LAST LIMIT 1) AS email,
      (SELECT cc.name FROM public.client_contacts cc
        WHERE cc.client_id = v_client_id AND cc.deleted_at IS NULL AND cc.email IS NOT NULL
        ORDER BY cc.is_primary DESC NULLS LAST LIMIT 1) AS representative_name,
      (SELECT concat_ws(', ', ca.line1, ca.line2, ca.region) FROM public.client_addresses ca
        WHERE ca.client_id = v_client_id AND ca.deleted_at IS NULL LIMIT 1) AS domicile
  ) b;

  RETURN v_contract || jsonb_build_object('items', v_items, 'payments', v_payments, 'buyer', v_buyer);
END; $$;

NOTIFY pgrst, 'reload schema';
