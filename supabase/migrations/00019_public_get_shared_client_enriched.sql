-- ============================================================
-- 00019_public_get_shared_client_enriched.sql
--
-- Enriquece la ficha pública del cliente compartido con:
--  - Contratos vigentes (sin cancelados) con items + pagos embebidos
--  - Totales agregados: # contratos, total USD, plantas comprometidas/
--    entregadas, monto pagado/por cobrar, # pagos vencidos.
--
-- La función sigue siendo anon-readable y solo expone data del cliente
-- al que pertenece el link. Sigue actualizando open_count/last_opened_at.
-- ============================================================

CREATE OR REPLACE FUNCTION public.public_get_shared_client(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_link_id uuid; v_client_id uuid; v_expires timestamptz;
  v_client jsonb; v_contacts jsonb; v_contracts jsonb; v_totals jsonb;
BEGIN
  IF p_token IS NULL OR length(p_token) < 8 THEN RETURN NULL; END IF;
  SELECT csl.id, csl.client_id, csl.expires_at
    INTO v_link_id, v_client_id, v_expires
    FROM public.client_share_links csl
    WHERE csl.token = p_token AND csl.revoked_at IS NULL;
  IF v_link_id IS NULL THEN RETURN NULL; END IF;
  IF v_expires IS NOT NULL AND v_expires < now() THEN RETURN NULL; END IF;

  SELECT to_jsonb(r) INTO v_client FROM (
    SELECT c.id, c.name, c.legal_name, c.giro, c.region,
           co.name_es AS country_name, co.iso2 AS country_iso2,
           au.full_name AS kam_name, au.email::text AS kam_email, au.phone AS kam_phone
    FROM public.clients c
    LEFT JOIN public.countries co ON co.id = c.country_id
    LEFT JOIN public.app_users au ON au.id = c.account_owner_id
    WHERE c.id = v_client_id AND c.deleted_at IS NULL) r;
  IF v_client IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(cc) ORDER BY cc.is_primary DESC, cc.name), '[]'::jsonb)
    INTO v_contacts FROM (
    SELECT name, role, email::text AS email, phone, is_primary
    FROM public.client_contacts WHERE client_id = v_client_id AND deleted_at IS NULL) cc;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.signed_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_contracts FROM (
    SELECT
      ct.id, ct.number, ct.status::text AS status,
      ct.condition::text AS condition, ct.sale_type::text AS sale_type,
      ct.currency::text AS currency, ct.signed_at,
      ct.total_neto, ct.total_neto_usd, ct.incoterm,
      (SELECT COALESCE(jsonb_agg(to_jsonb(i) ORDER BY i.delivery_year NULLS LAST, i.delivery_week NULLS LAST), '[]'::jsonb)
       FROM (
         SELECT v.name AS variety_name, s.name AS species_name,
                ci.qty_plants, ci.qty_delivered, ci.format,
                ci.material_type::text AS material_type,
                ci.delivery_year, ci.delivery_week, ci.delivery_month,
                ci.status::text AS status,
                GREATEST(ci.qty_plants - COALESCE(ci.qty_delivered, 0), 0) AS qty_pending
         FROM public.contract_items ci
         LEFT JOIN public.varieties v ON v.id = ci.variety_id
         LEFT JOIN public.species s ON s.id = v.species_id
         WHERE ci.contract_id = ct.id AND ci.deleted_at IS NULL) i) AS items,
      (SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.due_date NULLS LAST), '[]'::jsonb)
       FROM (
         SELECT type::text AS type, amount, iva, currency::text AS currency,
                status::text AS status, due_date, paid_at, reference
         FROM public.payments
         WHERE contract_id = ct.id AND deleted_at IS NULL) p) AS payments
    FROM public.contracts ct
    WHERE ct.client_id = v_client_id AND ct.deleted_at IS NULL
      AND ct.status::text <> 'cancelado') c;

  SELECT to_jsonb(t) INTO v_totals FROM (
    SELECT
      (SELECT COUNT(*) FROM public.contracts
        WHERE client_id = v_client_id AND deleted_at IS NULL
          AND status::text <> 'cancelado') AS contracts_count,
      (SELECT COALESCE(SUM(total_neto_usd), 0) FROM public.contracts
        WHERE client_id = v_client_id AND deleted_at IS NULL
          AND status::text <> 'cancelado') AS total_usd,
      (SELECT COALESCE(SUM(ci.qty_plants), 0) FROM public.contract_items ci
        JOIN public.contracts ct ON ct.id = ci.contract_id
        WHERE ct.client_id = v_client_id AND ct.deleted_at IS NULL
          AND ct.status::text <> 'cancelado' AND ci.deleted_at IS NULL) AS plants_total,
      (SELECT COALESCE(SUM(ci.qty_delivered), 0) FROM public.contract_items ci
        JOIN public.contracts ct ON ct.id = ci.contract_id
        WHERE ct.client_id = v_client_id AND ct.deleted_at IS NULL
          AND ct.status::text <> 'cancelado' AND ci.deleted_at IS NULL) AS plants_delivered,
      (SELECT COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'pagado'), 0) FROM public.payments p
        JOIN public.contracts ct ON ct.id = p.contract_id
        WHERE ct.client_id = v_client_id AND ct.deleted_at IS NULL
          AND ct.status::text <> 'cancelado' AND p.deleted_at IS NULL) AS payments_paid,
      (SELECT COALESCE(SUM(p.amount) FILTER (WHERE p.status IN ('pendiente','vencido')), 0) FROM public.payments p
        JOIN public.contracts ct ON ct.id = p.contract_id
        WHERE ct.client_id = v_client_id AND ct.deleted_at IS NULL
          AND ct.status::text <> 'cancelado' AND p.deleted_at IS NULL) AS payments_pending,
      (SELECT COUNT(*) FILTER (WHERE p.status = 'vencido') FROM public.payments p
        JOIN public.contracts ct ON ct.id = p.contract_id
        WHERE ct.client_id = v_client_id AND ct.deleted_at IS NULL
          AND ct.status::text <> 'cancelado' AND p.deleted_at IS NULL) AS payments_overdue_count
  ) t;

  UPDATE public.client_share_links
    SET open_count = open_count + 1, last_opened_at = now()
    WHERE id = v_link_id;

  RETURN v_client || jsonb_build_object(
    'contacts', v_contacts,
    'contracts', v_contracts,
    'totals', v_totals
  );
END; $$;

REVOKE ALL ON FUNCTION public.public_get_shared_client(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_shared_client(text) TO anon, authenticated;
