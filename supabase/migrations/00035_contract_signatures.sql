-- ============================================================
-- 00035_contract_signatures.sql
--
-- Integración DocuSign ↔ Hijuelas Growth (ver docs/docusign-integration-plan.md).
-- Tabla que rastrea el ciclo de vida de un sobre (envelope) de firma por contrato.
--
-- Patrón de acceso (consistente con el resto del proyecto):
--   - Lectura: authenticated del equipo (RLS SELECT true).
--   - Escritura desde la app (server action, usuario autenticado): RPC
--     docusign_record_sent() SECURITY DEFINER.
--   - Escritura desde el webhook (DocuSign Connect, sin sesión / anon): RPC
--     docusign_apply_event() SECURITY DEFINER. La autenticidad la garantiza la
--     verificación HMAC en el route handler ANTES de llamar al RPC; el RPC además
--     exige que la fila ya exista (envelope_id creado por un envío autenticado).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.contract_signatures (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id     uuid NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  provider        text NOT NULL DEFAULT 'docusign',
  envelope_id     text,
  -- created | sent | delivered | completed | declined | voided
  status          text NOT NULL DEFAULT 'created',
  signer_email    text NOT NULL,
  signer_name     text,
  signed_pdf_url  text,          -- PDF firmado archivado en Supabase Storage (path)
  certificate_url text,          -- Certificate of Completion archivado (path)
  document_hash   text,          -- SHA256 del PDF original enviado a firmar
  sent_at         timestamptz,
  delivered_at    timestamptz,
  completed_at    timestamptz,
  declined_reason text,
  raw_event       jsonb,         -- último payload de Connect (audit)
  created_by      uuid REFERENCES public.app_users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS contract_signatures_contract_id_idx
  ON public.contract_signatures(contract_id);
CREATE UNIQUE INDEX IF NOT EXISTS contract_signatures_envelope_id_uidx
  ON public.contract_signatures(envelope_id) WHERE envelope_id IS NOT NULL;

ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

-- Lectura para el equipo autenticado (mismo criterio amplio que el resto de la app).
DROP POLICY IF EXISTS contract_signatures_authenticated_read ON public.contract_signatures;
CREATE POLICY contract_signatures_authenticated_read ON public.contract_signatures
  FOR SELECT TO authenticated USING (true);

-- Sin escritura directa: todo pasa por los RPC SECURITY DEFINER de abajo.
DROP POLICY IF EXISTS contract_signatures_no_direct_write ON public.contract_signatures;
CREATE POLICY contract_signatures_no_direct_write ON public.contract_signatures
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- ------------------------------------------------------------
-- RPC: registrar un envío (lo llama el server action sendContractForSignature).
-- Upsert por contrato: si ya había una firma para el contrato, la reemplaza
-- (un contrato tiene a lo sumo un envelope "vivo"). Devuelve el id de la fila.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.docusign_record_sent(
  p_contract_id   uuid,
  p_envelope_id   text,
  p_signer_email  text,
  p_signer_name   text,
  p_document_hash text
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  caller_id   uuid := auth.uid();
  caller_role public.user_role;
  v_id        uuid;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501'; END IF;
  SELECT role INTO caller_role FROM public.app_users
    WHERE id = caller_id AND deleted_at IS NULL AND is_active = true;
  IF caller_role IS NULL THEN RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.contracts WHERE id = p_contract_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Contrato no encontrado.' USING ERRCODE = '42704';
  END IF;

  -- Limpia cualquier sobre previo del contrato que no esté completado.
  DELETE FROM public.contract_signatures
    WHERE contract_id = p_contract_id AND status <> 'completed';

  INSERT INTO public.contract_signatures (
    contract_id, provider, envelope_id, status,
    signer_email, signer_name, document_hash, sent_at, created_by
  ) VALUES (
    p_contract_id, 'docusign', p_envelope_id, 'sent',
    p_signer_email, p_signer_name, p_document_hash, now(), caller_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END; $$;

REVOKE ALL ON FUNCTION public.docusign_record_sent(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.docusign_record_sent(uuid, text, text, text, text) TO authenticated;

-- ------------------------------------------------------------
-- RPC: aplicar un evento de Connect (lo llama el webhook).
-- Mapea el estado del envelope → contract_signatures.status y, en 'completed',
-- avanza contracts.status a 'firmado' (+ signed_at). anon-callable: protegido por
-- HMAC en el route handler + exige que el envelope_id exista. Devuelve el
-- contract_id afectado (o NULL si no hay match).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.docusign_apply_event(
  p_envelope_id     text,
  p_status          text,
  p_signed_pdf_url  text DEFAULT NULL,
  p_certificate_url text DEFAULT NULL,
  p_declined_reason text DEFAULT NULL,
  p_completed_at    timestamptz DEFAULT NULL,
  p_raw_event       jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_contract_id    uuid;
  v_current_status text;
  v_completed      timestamptz := COALESCE(p_completed_at, now());
BEGIN
  IF p_envelope_id IS NULL OR length(p_envelope_id) < 8 THEN RETURN NULL; END IF;

  SELECT contract_id, status INTO v_contract_id, v_current_status
    FROM public.contract_signatures
    WHERE envelope_id = p_envelope_id;
  IF v_contract_id IS NULL THEN RETURN NULL; END IF;

  -- No degradar un sobre ya completado.
  IF v_current_status = 'completed' AND p_status <> 'completed' THEN
    RETURN v_contract_id;
  END IF;

  UPDATE public.contract_signatures SET
    status          = p_status,
    signed_pdf_url  = COALESCE(p_signed_pdf_url, signed_pdf_url),
    certificate_url = COALESCE(p_certificate_url, certificate_url),
    declined_reason = COALESCE(p_declined_reason, declined_reason),
    delivered_at    = CASE WHEN p_status = 'delivered' THEN COALESCE(delivered_at, now()) ELSE delivered_at END,
    completed_at    = CASE WHEN p_status = 'completed' THEN v_completed ELSE completed_at END,
    raw_event       = COALESCE(p_raw_event, raw_event),
    updated_at      = now()
  WHERE envelope_id = p_envelope_id;

  -- Al completarse el sobre, el contrato pasa a firmado (si no lo está ya).
  IF p_status = 'completed' THEN
    UPDATE public.contracts
      SET status = 'firmado',
          signed_at = COALESCE(signed_at, v_completed)
      WHERE id = v_contract_id
        AND status IN ('borrador', 'por_revisar')
        AND deleted_at IS NULL;
  END IF;

  RETURN v_contract_id;
END; $$;

REVOKE ALL ON FUNCTION public.docusign_apply_event(text, text, text, text, text, timestamptz, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.docusign_apply_event(text, text, text, text, text, timestamptz, jsonb) TO anon, authenticated;

-- ------------------------------------------------------------
-- RPC: archivar el PDF firmado / certificado desde un server action autenticado
-- (fallback cuando el webhook no tiene service role para escribir Storage).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.docusign_set_signed_pdf(
  p_envelope_id     text,
  p_signed_pdf_url  text,
  p_certificate_url text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  caller_id uuid := auth.uid();
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_users
                 WHERE id = caller_id AND deleted_at IS NULL AND is_active = true) THEN
    RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.contract_signatures SET
    signed_pdf_url  = COALESCE(p_signed_pdf_url, signed_pdf_url),
    certificate_url = COALESCE(p_certificate_url, certificate_url),
    updated_at      = now()
  WHERE envelope_id = p_envelope_id;
END; $$;

REVOKE ALL ON FUNCTION public.docusign_set_signed_pdf(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.docusign_set_signed_pdf(text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
