-- ============================================================
-- 00034_fix_admin_create_user_app_users_upsert.sql
--
-- Bug: crear un usuario desde /admin/usuarios fallaba con
--   "duplicate key value violates unique constraint app_users_pkey".
--
-- Causa raíz: la migración 00024 agregó el trigger
--   sync_app_user_from_auth (AFTER INSERT ON auth.users) que crea
--   automáticamente la fila en public.app_users (rol viewer).
--   Pero admin_create_user (definido en 00010) ya hacía su PROPIO
--   INSERT INTO app_users DESPUÉS de insertar en auth.users. Con el
--   trigger en su lugar, la secuencia es:
--     1) INSERT auth.users  → trigger crea app_users (viewer)
--     2) INSERT auth.identities
--     3) INSERT app_users (rol elegido)  → CHOCA con la fila del paso 1
--   → duplicate key en app_users_pkey.
--
-- Fix: convertir el INSERT de app_users en un UPSERT. Queda
--   independiente del orden y, además, corrige el rol — el trigger
--   deja "viewer" y el upsert lo sobreescribe con el rol que el admin
--   eligió en el panel.
-- ============================================================

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

  -- UPSERT: el trigger sync_app_user_from_auth (00024) pudo haber creado
  -- ya esta fila con rol 'viewer'. La sobreescribimos con el rol elegido.
  INSERT INTO public.app_users (
    id, full_name, email, role, is_active, created_at, updated_at
  ) VALUES (new_id, p_full_name, p_email, p_role, true, NOW(), NOW())
  ON CONFLICT (id) DO UPDATE SET
    full_name  = EXCLUDED.full_name,
    email      = EXCLUDED.email,
    role       = EXCLUDED.role,
    is_active  = true,
    updated_at = NOW();

  RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text, public.user_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, public.user_role) TO authenticated;

NOTIFY pgrst, 'reload schema';
