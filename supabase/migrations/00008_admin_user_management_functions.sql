-- ============================================================
-- 00008_admin_user_management_functions.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Funciones SECURITY DEFINER para gestión de usuarios desde el front
-- SIN exponer SUPABASE_SERVICE_ROLE_KEY.
--
-- Cada función:
--   1) Llama a _require_admin() que valida que auth.uid() sea admin
--      activo (raise exception si no).
--   2) Ejecuta operaciones sobre auth.users / auth.identities /
--      app_users con privilegios del owner (postgres).
--   3) Está marcada SECURITY DEFINER + search_path explícito para
--      evitar SQL injection vía search_path.
--
-- También crea usuario eschwerter@ vía SQL directo en migración previa
-- (la primera vez se hizo ad-hoc; el patrón ahora vive en las funciones).
-- ============================================================

BEGIN;

-- Helper
CREATE OR REPLACE FUNCTION public._require_admin()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_id uuid;
  caller_role public.user_role;
  caller_active boolean;
BEGIN
  caller_id := auth.uid();
  IF caller_id IS NULL THEN
    RAISE EXCEPTION 'No autenticado.' USING ERRCODE = '42501';
  END IF;
  SELECT role, is_active INTO caller_role, caller_active
    FROM public.app_users
    WHERE id = caller_id AND deleted_at IS NULL;
  IF caller_role IS DISTINCT FROM 'admin' OR caller_active IS NOT TRUE THEN
    RAISE EXCEPTION 'Solo admin.' USING ERRCODE = '42501';
  END IF;
  RETURN caller_id;
END;
$$;

-- LIST (con cast a text por la columna citext)
CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS TABLE(
  id uuid,
  full_name text,
  email text,
  role public.user_role,
  is_active boolean,
  created_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  PERFORM public._require_admin();
  RETURN QUERY
    SELECT au.id,
           au.full_name::text,
           au.email::text,
           au.role,
           au.is_active,
           au.created_at,
           u.last_sign_in_at
      FROM public.app_users au
      LEFT JOIN auth.users u ON u.id = au.id
      WHERE au.deleted_at IS NULL
      ORDER BY au.full_name ASC;
END;
$$;

-- CREATE
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

  INSERT INTO auth.users (
    id, instance_id, aud, role, email, encrypted_password,
    email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) VALUES (
    new_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    p_email, extensions.crypt(p_password, extensions.gen_salt('bf')), NOW(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('email', p_email, 'full_name', p_full_name),
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

-- UPDATE
CREATE OR REPLACE FUNCTION public.admin_update_user(
  p_id uuid, p_full_name text, p_email text,
  p_role public.user_role, p_is_active boolean, p_password text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
BEGIN
  PERFORM public._require_admin();
  IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE id = p_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado.' USING ERRCODE = '02000';
  END IF;
  IF p_email IS NULL OR position('@' in p_email) < 2 THEN
    RAISE EXCEPTION 'Email inválido.' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = p_email AND id <> p_id) THEN
    RAISE EXCEPTION 'Ya hay otro usuario con ese email.' USING ERRCODE = '23505';
  END IF;
  IF p_password IS NOT NULL AND char_length(p_password) < 8 THEN
    RAISE EXCEPTION 'Password debe tener al menos 8 caracteres.' USING ERRCODE = '22023';
  END IF;

  UPDATE auth.users SET
    email = p_email,
    encrypted_password = CASE WHEN p_password IS NOT NULL
      THEN extensions.crypt(p_password, extensions.gen_salt('bf'))
      ELSE encrypted_password END,
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('email', p_email, 'full_name', p_full_name),
    updated_at = NOW()
  WHERE id = p_id;

  UPDATE auth.identities SET
    identity_data = COALESCE(identity_data, '{}'::jsonb)
      || jsonb_build_object('email', p_email, 'email_verified', true),
    updated_at = NOW()
  WHERE user_id = p_id AND provider = 'email';

  UPDATE public.app_users SET
    full_name = p_full_name, email = p_email, role = p_role,
    is_active = p_is_active, updated_at = NOW()
  WHERE id = p_id;
END;
$$;

-- DELETE
CREATE OR REPLACE FUNCTION public.admin_delete_user(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  caller_id uuid;
BEGIN
  caller_id := public._require_admin();
  IF caller_id = p_id THEN
    RAISE EXCEPTION 'No podés eliminar tu propio usuario.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.app_users WHERE id = p_id) THEN
    RAISE EXCEPTION 'Usuario no encontrado.' USING ERRCODE = '02000';
  END IF;
  UPDATE public.app_users SET
    deleted_at = NOW(), is_active = false, updated_at = NOW()
  WHERE id = p_id;
  UPDATE auth.users SET
    banned_until = NOW() + INTERVAL '100 years', updated_at = NOW()
  WHERE id = p_id;
END;
$$;

REVOKE ALL ON FUNCTION public._require_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_users() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_create_user(text, text, text, public.user_role) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_user(uuid, text, text, public.user_role, boolean, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_create_user(text, text, text, public.user_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_user(uuid, text, text, public.user_role, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
