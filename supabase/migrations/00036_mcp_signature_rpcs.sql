-- ============================================================
-- 00036_mcp_signature_rpcs.sql
--
-- Soporte de firma electrónica vía MCP (disponible a sales + admin).
-- El MCP no usa sesión Supabase (auth.uid() es NULL); valida su propio token y
-- pasa p_user_id explícito, igual que el resto de los RPC mcp_*. Por eso estos
-- RPCs reciben p_user_id y NO dependen de auth.uid().
--
-- Roles habilitados a firmar (enviar/anular): admin, mcp_editor, sales, sales_support.
-- Consultar estado: cualquier usuario activo.
-- ============================================================

-- Helper: valida que el caller MCP exista, esté activo y pueda firmar.
CREATE OR REPLACE FUNCTION public._mcp_require_signer(p_user_id uuid)
RETURNS public.user_role
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE r public.user_role;
BEGIN
  IF p_user_id IS NULL THEN RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501'; END IF;
  SELECT role INTO r FROM public.app_users
    WHERE id = p_user_id AND deleted_at IS NULL AND is_active = true;
  IF r IS NULL THEN RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501'; END IF;
  IF r NOT IN ('admin','mcp_editor','sales','sales_support') THEN
    RAISE EXCEPTION 'Rol % no autorizado a firmar vía MCP.', r USING ERRCODE = '42501';
  END IF;
  RETURN r;
END; $$;
REVOKE ALL ON FUNCTION public._mcp_require_signer(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mcp_require_signer(uuid) TO anon, authenticated;

-- Bundle de datos del contrato para generar el PDF legal + firmantes.
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
           og.name AS org_name, og.legal_name AS org_legal_name, og.tax_id AS org_tax_id
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
REVOKE ALL ON FUNCTION public.mcp_contract_for_signature(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_contract_for_signature(uuid, uuid) TO anon, authenticated;

-- Registrar el envío (versión MCP con p_user_id explícito).
CREATE OR REPLACE FUNCTION public.mcp_docusign_record_sent(
  p_user_id uuid,
  p_contract_id uuid,
  p_envelope_id text,
  p_signer_email text,
  p_signer_name text,
  p_document_hash text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_id uuid;
BEGIN
  PERFORM public._mcp_require_signer(p_user_id);
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '42704';
  END IF;
  DELETE FROM public.contract_signatures
    WHERE contract_id = p_contract_id AND status <> 'completed';
  INSERT INTO public.contract_signatures (
    contract_id, provider, envelope_id, status,
    signer_email, signer_name, document_hash, sent_at, created_by
  ) VALUES (
    p_contract_id, 'docusign', p_envelope_id, 'sent',
    p_signer_email, p_signer_name, p_document_hash, now(), p_user_id
  ) RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE ALL ON FUNCTION public.mcp_docusign_record_sent(uuid, uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_docusign_record_sent(uuid, uuid, text, text, text, text) TO anon, authenticated;

-- Consultar estado de firma (lectura; cualquier usuario activo).
CREATE OR REPLACE FUNCTION public.mcp_docusign_signature_status(
  p_user_id uuid,
  p_contract_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v jsonb;
BEGIN
  IF p_user_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.app_users WHERE id = p_user_id AND deleted_at IS NULL AND is_active = true
  ) THEN RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501'; END IF;

  SELECT to_jsonb(s) INTO v FROM (
    SELECT cs.id, cs.contract_id, cs.envelope_id, cs.status, cs.signer_email, cs.signer_name,
           cs.sent_at, cs.delivered_at, cs.completed_at, cs.declined_reason,
           cs.signed_pdf_url, cs.certificate_url
    FROM public.contract_signatures cs
    WHERE cs.contract_id = p_contract_id
    ORDER BY cs.created_at DESC LIMIT 1
  ) s;
  RETURN COALESCE(v, 'null'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.mcp_docusign_signature_status(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_docusign_signature_status(uuid, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
