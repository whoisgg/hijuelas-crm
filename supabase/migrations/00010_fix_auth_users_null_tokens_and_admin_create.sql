-- ============================================================
-- 00010_fix_auth_users_null_tokens_and_admin_create.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Bug:
--   Login fallaba con "Database error querying schema" para los
--   usuarios eschwerter@ y jossa@ (los únicos creados via INSERT
--   directo en auth.users antes de tener las funciones admin_*).
--   GoTrue log mostraba:
--     sql: Scan error on column index 3, name "confirmation_token":
--     converting NULL to string is unsupported
--
-- Causa:
--   Los INSERT ad-hoc no setearon los campos token-string que GoTrue
--   espera siempre NOT NULL (aunque a nivel Postgres permiten NULL).
--   Cuando el driver Go escanea el row, esos NULL revientan.
--
-- Fix en 2 partes:
--   1) Backfill: rellenar con '' todos los campos token-string que
--      estén NULL en cualquier row de auth.users.
--   2) admin_create_user: setear esos campos explícitamente como '' al
--      crear, para que no vuelva a pasar via panel /admin/usuarios.
-- ============================================================

BEGIN;

-- 1) Backfill defensivo
UPDATE auth.users SET
  confirmation_token         = COALESCE(confirmation_token, ''),
  recovery_token             = COALESCE(recovery_token, ''),
  email_change_token_new     = COALESCE(email_change_token_new, ''),
  email_change_token_current = COALESCE(email_change_token_current, ''),
  email_change               = COALESCE(email_change, ''),
  phone_change_token         = COALESCE(phone_change_token, ''),
  phone_change               = COALESCE(phone_change, ''),
  reauthentication_token     = COALESCE(reauthentication_token, '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change_token_current IS NULL
   OR email_change IS NULL
   OR phone_change_token IS NULL
   OR phone_change IS NULL
   OR reauthentication_token IS NULL;

-- 2) admin_create_user con tokens explícitos
CREATE OR REPLACE FUNCTION public.admin_create_user(
  p_full_name text,
  p_email text,
  p_password text,
  p_role public.user_role
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  new_id uuid := gen_random_uuid();
BEGIN
  PERFORM public._require_admin();
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RAISE EXCEPTION 'Email inválido.' USING ERRCODE = '22023';
  END IF;
  IF char_length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password debe tener al menos 8 caracteres.' USING ERRCODE = '22023';
  END IF;
  IF char_length(coalesce(p_full_name, '')) < 2 THEN
    RAISE EXCEPTION 'Nombre demasiado corto.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email) THEN
    RAISE EXCEPTION 'Ya existe un usuario con ese email.' USING ERRCODE = '23505';
  END IF;

  -- IMPORTANTE: los campos token deben ser '' (no NULL) para que GoTrue
  -- pueda escanear el row sin tirar "converting NULL to string".
  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token,
    email_change_token_new, email_change_token_current, email_change,
    phone_change_token, phone_change, reauthentication_token,
    created_at, updated_at
  ) VALUES (
    new_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('email', p_email, 'full_name', p_full_name),
    '', '', '', '', '', '', '', '',
    NOW(), NOW()
  );

  INSERT INTO auth.identities (
    id, user_id, provider_id, provider, identity_data, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_id, new_id::text, 'email',
    jsonb_build_object('sub', new_id::text, 'email', p_email, 'email_verified', true),
    NOW(), NOW()
  );

  INSERT INTO public.app_users (
    id, full_name, email, role, is_active, created_at, updated_at
  ) VALUES (new_id, p_full_name, p_email, p_role, true, NOW(), NOW());

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text, public.user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, public.user_role) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
