-- ============================================================
-- 00006_fix_kam_emails_grupohijuelas.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Corrige los emails de los 6 KAM sales al formato real de
-- @grupohijuelas.com (inicial + apellido, sin punto).
-- ============================================================

BEGIN;

UPDATE app_users SET email = 'fsannazzaro@grupohijuelas.com', updated_at = NOW()
  WHERE id = '227a2234-f3be-4ec6-bb35-a445d0bda567';  -- Franco Sannazzaro

UPDATE app_users SET email = 'jmohr@grupohijuelas.com', updated_at = NOW()
  WHERE id = 'a0b55180-3bdc-47ff-bf05-954735fb33a9';  -- Jorge Mohr

UPDATE app_users SET email = 'jvidal@grupohijuelas.com', updated_at = NOW()
  WHERE id = '326adb2f-d65e-4e41-a225-1edecf2c5207';  -- Jorge Vidal

UPDATE app_users SET email = 'jsearle@grupohijuelas.com', updated_at = NOW()
  WHERE id = 'b7986e07-a126-4232-b7d8-3ee738df1e20';  -- Jose Ignacio Searle

UPDATE app_users SET email = 'jgoycoolea@grupohijuelas.com', updated_at = NOW()
  WHERE id = 'ea0065a2-732b-4181-a793-b83d0347e704';  -- Juan Goycoolea

UPDATE app_users SET email = 'projas@grupohijuelas.com', updated_at = NOW()
  WHERE id = '98b89873-9739-49c8-bb39-fc567234b38f';  -- Pablo Rojas

COMMIT;
