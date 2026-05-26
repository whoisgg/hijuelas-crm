-- ============================================================
-- 00016_client_share_links.sql
--
-- Tab "Compartir cliente" del módulo /compartir. Genera links
-- públicos URL-safe que muestran una ficha de contacto del cliente
-- (KAM, contactos, info básica). No requiere login para abrir.
--
-- Auditoría: open_count + last_opened_at se incrementan en cada
-- lectura pública (public_get_shared_client).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.client_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  expires_at timestamptz,
  open_count integer NOT NULL DEFAULT 0,
  last_opened_at timestamptz,
  created_by uuid NOT NULL REFERENCES public.app_users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS client_share_links_client_id_idx
  ON public.client_share_links(client_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS client_share_links_token_idx
  ON public.client_share_links(token) WHERE revoked_at IS NULL;

ALTER TABLE public.client_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_share_links_authenticated_read ON public.client_share_links;
CREATE POLICY client_share_links_authenticated_read ON public.client_share_links
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS client_share_links_no_direct_write ON public.client_share_links;
CREATE POLICY client_share_links_no_direct_write ON public.client_share_links
  FOR ALL TO authenticated USING (false) WITH CHECK (false);

-- Crear share link (devuelve plaintext token URL-safe).
CREATE OR REPLACE FUNCTION public.create_client_share_link(
  p_client_id uuid,
  p_ttl_days integer DEFAULT 30
)
RETURNS TABLE(id uuid, token text, expires_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions, pg_temp AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role public.user_role;
  v_token text;
  v_expires timestamptz;
  v_id uuid;
BEGIN
  -- Variables locales para evitar el "column reference is ambiguous" entre los
  -- OUT params del RETURNS TABLE y las columnas de client_share_links.
  IF caller_id IS NULL THEN RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501'; END IF;
  SELECT role INTO caller_role FROM public.app_users
    WHERE app_users.id = caller_id AND deleted_at IS NULL AND is_active = true;
  IF caller_role IS NULL THEN RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clients WHERE clients.id = p_client_id AND deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Cliente no encontrado.' USING ERRCODE = '42704';
  END IF;
  v_token := replace(replace(encode(gen_random_bytes(24), 'base64'), '+', '-'), '/', '_');
  v_token := rtrim(v_token, '=');
  v_expires := CASE
    WHEN p_ttl_days IS NULL OR p_ttl_days <= 0 THEN NULL
    ELSE now() + (p_ttl_days || ' days')::interval
  END;
  INSERT INTO public.client_share_links (client_id, token, expires_at, created_by)
    VALUES (p_client_id, v_token, v_expires, caller_id)
    RETURNING client_share_links.id INTO v_id;
  RETURN QUERY SELECT v_id, v_token, v_expires;
END; $$;

REVOKE ALL ON FUNCTION public.create_client_share_link(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_client_share_link(uuid, integer) TO authenticated;

-- Listar share links del caller (admin ve todos).
CREATE OR REPLACE FUNCTION public.list_client_share_links(p_client_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role public.user_role;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501'; END IF;
  SELECT role INTO caller_role FROM public.app_users
    WHERE id = caller_id AND deleted_at IS NULL AND is_active = true;
  IF caller_role IS NULL THEN RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501'; END IF;
  RETURN COALESCE((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at DESC) FROM (
    SELECT csl.id, csl.client_id, c.name AS client_name, c.country_id, co.name_es AS country_name,
           csl.token, csl.expires_at, csl.open_count, csl.last_opened_at,
           csl.created_by, au.full_name AS created_by_name, csl.created_at, csl.revoked_at
    FROM public.client_share_links csl
    LEFT JOIN public.clients c ON c.id = csl.client_id
    LEFT JOIN public.countries co ON co.id = c.country_id
    LEFT JOIN public.app_users au ON au.id = csl.created_by
    WHERE (caller_role = 'admin' OR csl.created_by = caller_id)
      AND (p_client_id IS NULL OR csl.client_id = p_client_id)) r), '[]'::jsonb);
END; $$;

REVOKE ALL ON FUNCTION public.list_client_share_links(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_client_share_links(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.revoke_client_share_link(p_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  caller_id uuid := auth.uid();
  caller_role public.user_role;
  v_creator uuid;
  v_affected int;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501'; END IF;
  SELECT role INTO caller_role FROM public.app_users
    WHERE id = caller_id AND deleted_at IS NULL AND is_active = true;
  SELECT created_by INTO v_creator FROM public.client_share_links WHERE id = p_id;
  IF v_creator IS NULL THEN RAISE EXCEPTION 'Link no encontrado.' USING ERRCODE = '42704'; END IF;
  IF v_creator <> caller_id AND caller_role <> 'admin' THEN
    RAISE EXCEPTION 'Solo el creador o un admin pueden revocar.' USING ERRCODE = '42501';
  END IF;
  UPDATE public.client_share_links SET revoked_at = now() WHERE id = p_id AND revoked_at IS NULL;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  IF v_affected = 0 THEN RAISE EXCEPTION 'Link ya estaba revocado.' USING ERRCODE = '42704'; END IF;
END; $$;

REVOKE ALL ON FUNCTION public.revoke_client_share_link(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.revoke_client_share_link(uuid) TO authenticated;

-- Lectura pública (anon). Devuelve la ficha o NULL si link inválido/expirado.
CREATE OR REPLACE FUNCTION public.public_get_shared_client(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_link_id uuid; v_client_id uuid; v_expires timestamptz;
  v_client jsonb; v_contacts jsonb;
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

  UPDATE public.client_share_links
    SET open_count = open_count + 1, last_opened_at = now()
    WHERE id = v_link_id;

  RETURN v_client || jsonb_build_object('contacts', v_contacts);
END; $$;

REVOKE ALL ON FUNCTION public.public_get_shared_client(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_shared_client(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
