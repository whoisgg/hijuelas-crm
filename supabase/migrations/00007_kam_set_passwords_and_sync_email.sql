-- ============================================================
-- 00007_kam_set_passwords_and_sync_email.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Setea password = 'hijuelascrm2026' para los 6 KAMs activos y
-- sincroniza auth.users.email con public.app_users.email (que ya
-- tenía los emails correctos del fix 00006).
--
-- IMPORTANTE: hacemos UPDATE directo en auth.users (no INSERT, que
-- está vetado). Usamos crypt(pwd, gen_salt('bf')) para hashear con
-- bcrypt, compatible con Supabase Auth.
--
-- También sincronizamos auth.identities.identity_data->>'email' para
-- el provider 'email' — el login por email lo lee de ahí.
-- (auth.identities.email es generated column, no se actualiza directo.)
-- ============================================================

BEGIN;

-- 1) auth.users: password + email + email_confirmed_at + meta
UPDATE auth.users u
SET
  encrypted_password = crypt('hijuelascrm2026', gen_salt('bf')),
  email = au.email,
  email_confirmed_at = COALESCE(u.email_confirmed_at, NOW()),
  updated_at = NOW(),
  raw_user_meta_data = COALESCE(u.raw_user_meta_data, '{}'::jsonb)
    || jsonb_build_object('email', au.email)
FROM public.app_users au
WHERE au.id = u.id
  AND au.role = 'sales'
  AND au.is_active = true
  AND au.deleted_at IS NULL;

-- 2) auth.identities: actualizar identity_data para el provider email
UPDATE auth.identities i
SET
  identity_data = COALESCE(i.identity_data, '{}'::jsonb)
    || jsonb_build_object('email', au.email, 'email_verified', true),
  updated_at = NOW()
FROM public.app_users au
WHERE au.id = i.user_id
  AND i.provider = 'email'
  AND au.role = 'sales'
  AND au.is_active = true
  AND au.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';

COMMIT;
