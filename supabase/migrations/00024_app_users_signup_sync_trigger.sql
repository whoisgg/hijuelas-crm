-- ============================================================
-- 00024_app_users_signup_sync_trigger.sql
--
-- Bug descubierto: Mario Castillo (mcastillo@grupohijuelas.com) se
-- registró con email/password el 2026-05-25 23:38, hizo login OK,
-- pero NUNCA apareció en /admin/usuarios y no se podían editar sus
-- permisos. Causa raíz: no había trigger que sincronice auth.users
-- → app_users en signup, así que el row de app_users nunca se creó.
--
-- Bonus diagnóstico: Mario también tenía null en confirmation_token /
-- recovery_token (mismo bug histórico aplicado a eschwerter/jossa en
-- 00010). Si se deja así, GoTrue rompe el "Database error querying
-- schema" en TODOS los logins (un solo NULL en una columna text
-- rompe el scan completo del driver Go).
--
-- Este migration:
--   1) Crea el row de Mario en app_users (idempotente, rol viewer).
--   2) Backfill defensivo de null tokens en TODOS los auth.users.
--   3) Trigger AFTER INSERT en auth.users que:
--      - setea tokens null a '' (defensa permanente)
--      - crea row en app_users con rol viewer + full_name de metadata.
-- ============================================================

-- 1) Fix inmediato Mario
UPDATE auth.users SET
  confirmation_token = COALESCE(NULLIF(confirmation_token, ''), ''),
  recovery_token = COALESCE(NULLIF(recovery_token, ''), ''),
  email_change_token_new = COALESCE(NULLIF(email_change_token_new, ''), ''),
  email_change = COALESCE(NULLIF(email_change, ''), ''),
  phone_change = COALESCE(NULLIF(phone_change, ''), ''),
  phone_change_token = COALESCE(NULLIF(phone_change_token, ''), ''),
  email_change_token_current = COALESCE(NULLIF(email_change_token_current, ''), ''),
  reauthentication_token = COALESCE(NULLIF(reauthentication_token, ''), '')
WHERE email = 'mcastillo@grupohijuelas.com';

INSERT INTO public.app_users (id, email, full_name, role, is_active, created_at, updated_at)
SELECT
  u.id,
  u.email::public.citext,
  COALESCE(u.raw_user_meta_data->>'full_name', u.email),
  'viewer'::public.user_role,
  true,
  COALESCE(u.created_at, now()),
  now()
FROM auth.users u
WHERE u.email = 'mcastillo@grupohijuelas.com'
ON CONFLICT (id) DO NOTHING;

-- 2) Backfill defensivo de todos los auth.users con null tokens
UPDATE auth.users SET
  confirmation_token = COALESCE(NULLIF(confirmation_token, ''), ''),
  recovery_token = COALESCE(NULLIF(recovery_token, ''), ''),
  email_change_token_new = COALESCE(NULLIF(email_change_token_new, ''), ''),
  email_change = COALESCE(NULLIF(email_change, ''), ''),
  phone_change = COALESCE(NULLIF(phone_change, ''), ''),
  phone_change_token = COALESCE(NULLIF(phone_change_token, ''), ''),
  email_change_token_current = COALESCE(NULLIF(email_change_token_current, ''), ''),
  reauthentication_token = COALESCE(NULLIF(reauthentication_token, ''), '')
WHERE confirmation_token IS NULL
   OR recovery_token IS NULL
   OR email_change_token_new IS NULL
   OR email_change IS NULL
   OR phone_change IS NULL
   OR phone_change_token IS NULL
   OR email_change_token_current IS NULL
   OR reauthentication_token IS NULL;

-- 3) Trigger permanente
CREATE OR REPLACE FUNCTION public._sync_app_user_from_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  UPDATE auth.users SET
    confirmation_token = COALESCE(NULLIF(confirmation_token, ''), ''),
    recovery_token = COALESCE(NULLIF(recovery_token, ''), ''),
    email_change_token_new = COALESCE(NULLIF(email_change_token_new, ''), ''),
    email_change = COALESCE(NULLIF(email_change, ''), ''),
    phone_change = COALESCE(NULLIF(phone_change, ''), ''),
    phone_change_token = COALESCE(NULLIF(phone_change_token, ''), ''),
    email_change_token_current = COALESCE(NULLIF(email_change_token_current, ''), ''),
    reauthentication_token = COALESCE(NULLIF(reauthentication_token, ''), '')
  WHERE id = NEW.id
    AND (confirmation_token IS NULL OR recovery_token IS NULL
      OR email_change_token_new IS NULL OR email_change IS NULL
      OR phone_change IS NULL OR phone_change_token IS NULL
      OR email_change_token_current IS NULL OR reauthentication_token IS NULL);

  INSERT INTO public.app_users (id, email, full_name, role, is_active, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email::public.citext,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    'viewer'::public.user_role,
    true,
    COALESCE(NEW.created_at, now()),
    now()
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_app_user_from_auth ON auth.users;
CREATE TRIGGER sync_app_user_from_auth
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public._sync_app_user_from_auth();

NOTIFY pgrst, 'reload schema';
