-- ============================================================
-- 00037_organization_legal_fields.sql
--
-- Datos legales por organización vendedora, para el contrato de compraventa
-- (representante legal, domicilio, banco, contacto de avisos, firmante DocuSign).
-- Reemplaza el hardcode de frambuesa-legal.ts: el "vendedor" es modificable por
-- organización desde /admin/organizaciones.
-- ============================================================

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS legal_representative_name text,
  ADD COLUMN IF NOT EXISTS legal_representative_id   text,  -- cédula / RUT del representante
  ADD COLUMN IF NOT EXISTS legal_domicile            text,
  ADD COLUMN IF NOT EXISTS bank_name                 text,
  ADD COLUMN IF NOT EXISTS bank_account              text,
  ADD COLUMN IF NOT EXISTS notice_name               text,
  ADD COLUMN IF NOT EXISTS notice_email              text,
  ADD COLUMN IF NOT EXISTS signer_email              text;  -- firmante interno DocuSign (/sn2/)

-- Seed VIVEROS HIJUELAS S.A. (org vendedora con contract_prefix 'VHSA').
UPDATE public.organizations SET
  legal_name = COALESCE(legal_name, 'VIVEROS HIJUELAS S.A.'),
  tax_id = COALESCE(tax_id, '96.835.510-4'),
  legal_representative_name = COALESCE(legal_representative_name, 'Gaspar Goycoolea Vial'),
  legal_representative_id = COALESCE(legal_representative_id, '7.040.318-7'),
  legal_domicile = COALESCE(legal_domicile, 'Carretera Panamericana Norte Km 102, comuna de Hijuelas, Quinta Región'),
  bank_name = COALESCE(bank_name, 'Banco Crédito e Inversiones'),
  bank_account = COALESCE(bank_account, '88130312'),
  notice_name = COALESCE(notice_name, 'Marta Simon'),
  notice_email = COALESCE(notice_email, 'jgoycoolea@grupohijuelas.com'),
  signer_email = COALESCE(signer_email, 'gasparg@grupohijuelas.com')
WHERE contract_prefix = 'VHSA' AND deleted_at IS NULL;

-- Lectura admin de todas las orgs con datos legales.
CREATE OR REPLACE FUNCTION public.admin_list_organizations()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public._require_admin();
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.name) FROM (
    SELECT id, name, legal_name, tax_id, contract_prefix, default_currency::text AS default_currency,
           active, legal_representative_name, legal_representative_id, legal_domicile,
           bank_name, bank_account, notice_name, notice_email, signer_email
    FROM public.organizations WHERE deleted_at IS NULL
  ) r), '[]'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION public.admin_list_organizations() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_list_organizations() TO authenticated;

-- Actualización admin de los datos legales de una organización.
CREATE OR REPLACE FUNCTION public.admin_update_organization_legal(
  p_org_id uuid,
  p_legal_name text,
  p_tax_id text,
  p_legal_representative_name text,
  p_legal_representative_id text,
  p_legal_domicile text,
  p_bank_name text,
  p_bank_account text,
  p_notice_name text,
  p_notice_email text,
  p_signer_email text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM public._require_admin();
  UPDATE public.organizations SET
    legal_name = p_legal_name,
    tax_id = p_tax_id,
    legal_representative_name = p_legal_representative_name,
    legal_representative_id = p_legal_representative_id,
    legal_domicile = p_legal_domicile,
    bank_name = p_bank_name,
    bank_account = p_bank_account,
    notice_name = p_notice_name,
    notice_email = p_notice_email,
    signer_email = p_signer_email,
    updated_at = now()
  WHERE id = p_org_id AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Organización no encontrada.' USING ERRCODE = '42704'; END IF;
END; $$;
REVOKE ALL ON FUNCTION public.admin_update_organization_legal(uuid, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_update_organization_legal(uuid, text, text, text, text, text, text, text, text, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
