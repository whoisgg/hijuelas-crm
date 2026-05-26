-- ============================================================
-- 00013_mcp_tokens_and_editor_role.sql
--
-- Foundation para conectar Claude (u otro cliente MCP) directamente
-- al CRM. Cada usuario interno genera tokens personales que el cliente
-- MCP envía como Bearer en cada request a /api/mcp.
--
-- 1) Nuevo rol `mcp_editor` en user_role:
--    - Mismos permisos de lectura que viewer/sales para tools MCP de
--      consulta, PERO también puede ejecutar tools MCP de escritura
--      (crear/editar oportunidades, pagos, clientes, contratos, notas).
--    - admin también puede escribir vía MCP (incluido implícitamente
--      en el check `role IN ('admin','mcp_editor')` del route handler).
--
-- 2) Tabla `mcp_tokens`:
--    - Un usuario puede tener N tokens activos (uno por cliente MCP que
--      conecte: Claude Desktop laptop, Claude Code, etc).
--    - Guardamos solo el sha256 hex del plaintext — el plaintext se
--      muestra UNA SOLA VEZ al generarlo y no se puede recuperar.
--    - Plaintext format: `hjc_` + base64url(32 random bytes), ~47 chars.
--    - `scopes` queda como text[] para futuro (limitar tools por token).
--    - `revoked_at` soft-revoke; tokens revocados rechazados en validate.
--
-- 3) RPCs SECURITY DEFINER:
--    - mcp_create_token(name) — genera, hashea, persiste, devuelve plaintext.
--    - mcp_list_my_tokens() — lista del usuario actual sin hash ni plaintext.
--    - mcp_revoke_token(id) — soft delete del token.
--    - mcp_validate_token(plaintext) — devuelve user_id+role si válido,
--      NULL si no. Bumpea last_used_at. Lo llama el route handler vía
--      service-role-less RPC (Supabase server client con anon key — la
--      función es SECURITY DEFINER así que bypassa RLS).
--
-- IMPORTANTE: mcp_validate_token corre con anon role (sin auth.uid()),
-- pero por ser SECURITY DEFINER bypassa RLS y puede leer mcp_tokens.
-- La autorización de quién puede llamarla está implícita: necesita
-- conocer un token plaintext válido.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) Nuevo rol mcp_editor
-- ============================================================
ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'mcp_editor';

-- ============================================================
-- 2) Tabla mcp_tokens
-- ============================================================
CREATE TABLE IF NOT EXISTS public.mcp_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mcp_tokens_user_id_idx
  ON public.mcp_tokens(user_id)
  WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS mcp_tokens_token_hash_idx
  ON public.mcp_tokens(token_hash)
  WHERE revoked_at IS NULL;

COMMENT ON TABLE public.mcp_tokens IS
  'Bearer tokens personales para conectar clientes MCP (Claude Desktop, Claude Code, etc) al endpoint /api/mcp. Solo se guarda el sha256 hex del plaintext.';

ALTER TABLE public.mcp_tokens ENABLE ROW LEVEL SECURITY;

-- Los usuarios solo ven sus propios tokens (no el hash, eso lo filtra la RPC).
DROP POLICY IF EXISTS mcp_tokens_self_select ON public.mcp_tokens;
CREATE POLICY mcp_tokens_self_select ON public.mcp_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Insert/update/delete bloqueados directos — solo vía RPC.
DROP POLICY IF EXISTS mcp_tokens_no_direct_write ON public.mcp_tokens;
CREATE POLICY mcp_tokens_no_direct_write ON public.mcp_tokens
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- ============================================================
-- 3) RPC: crear token
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_create_token(p_name text)
RETURNS TABLE(id uuid, plaintext text, name text, created_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  caller_id uuid;
  caller_active boolean;
  v_plaintext text;
  v_hash text;
  v_id uuid;
  v_created_at timestamptz;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;

  SELECT is_active INTO caller_active
    FROM public.app_users
    WHERE app_users.id = caller_id AND deleted_at IS NULL;

  IF caller_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Usuario no activo.' USING ERRCODE = '42501';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'El nombre del token es obligatorio.' USING ERRCODE = '22023';
  END IF;

  -- 32 bytes aleatorios, base64url-safe.
  v_plaintext := 'hjc_' || replace(replace(encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_');
  -- Strip padding '='
  v_plaintext := rtrim(v_plaintext, '=');

  v_hash := encode(digest(v_plaintext, 'sha256'), 'hex');

  INSERT INTO public.mcp_tokens (user_id, name, token_hash)
  VALUES (caller_id, trim(p_name), v_hash)
  RETURNING mcp_tokens.id, mcp_tokens.created_at INTO v_id, v_created_at;

  RETURN QUERY SELECT v_id, v_plaintext, trim(p_name), v_created_at;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_create_token(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_create_token(text) TO authenticated;

-- ============================================================
-- 4) RPC: listar tokens del usuario actual
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_list_my_tokens()
RETURNS TABLE(
  id uuid,
  name text,
  scopes text[],
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT t.id, t.name, t.scopes, t.last_used_at, t.revoked_at, t.created_at
      FROM public.mcp_tokens t
      WHERE t.user_id = caller_id
      ORDER BY (t.revoked_at IS NULL) DESC, t.created_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_list_my_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_list_my_tokens() TO authenticated;

-- ============================================================
-- 5) RPC: revocar token
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_revoke_token(p_token_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  caller_id uuid;
  affected int;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;

  UPDATE public.mcp_tokens
    SET revoked_at = now()
    WHERE id = p_token_id
      AND user_id = caller_id
      AND revoked_at IS NULL;

  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected = 0 THEN
    RAISE EXCEPTION 'Token no encontrado o ya revocado.' USING ERRCODE = '42704';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_revoke_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mcp_revoke_token(uuid) TO authenticated;

-- ============================================================
-- 6) RPC: validar token (llamado desde el route handler, sin auth.uid)
-- ============================================================
CREATE OR REPLACE FUNCTION public.mcp_validate_token(p_token text)
RETURNS TABLE(
  user_id uuid,
  email text,
  role public.user_role,
  scopes text[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_hash text;
  v_token_id uuid;
  v_user_id uuid;
  v_role public.user_role;
  v_active boolean;
  v_email text;
  v_scopes text[];
BEGIN
  IF p_token IS NULL OR length(p_token) < 10 THEN
    RETURN;
  END IF;

  v_hash := encode(digest(p_token, 'sha256'), 'hex');

  SELECT t.id, t.user_id, t.scopes
    INTO v_token_id, v_user_id, v_scopes
    FROM public.mcp_tokens t
    WHERE t.token_hash = v_hash
      AND t.revoked_at IS NULL;

  IF v_token_id IS NULL THEN
    RETURN;
  END IF;

  SELECT u.role, u.is_active, u.email::text
    INTO v_role, v_active, v_email
    FROM public.app_users u
    WHERE u.id = v_user_id AND u.deleted_at IS NULL;

  IF v_active IS NOT TRUE THEN
    RETURN;
  END IF;

  -- Bump last_used_at sin bloquear (best-effort).
  UPDATE public.mcp_tokens
    SET last_used_at = now()
    WHERE id = v_token_id;

  RETURN QUERY SELECT v_user_id, v_email, v_role, v_scopes;
END;
$$;

REVOKE ALL ON FUNCTION public.mcp_validate_token(text) FROM PUBLIC;
-- El route handler usa el supabase client con anon key, así que damos
-- execute a anon. La función es SECURITY DEFINER y solo expone user_id si
-- el caller conoce un token plaintext válido.
GRANT EXECUTE ON FUNCTION public.mcp_validate_token(text) TO anon, authenticated;

COMMIT;

NOTIFY pgrst, 'reload schema';
