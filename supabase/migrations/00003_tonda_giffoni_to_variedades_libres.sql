-- ============================================================
-- 00003_tonda_giffoni_to_variedades_libres.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Tonda Giffoni es una variedad italiana, no pertenece a OSU.
-- La movemos a "Variedades Libres" (mismo grupo que Barcelona).
-- ============================================================

BEGIN;

UPDATE varieties
  SET genetic_program_id = 'd3125239-b7c3-41f0-8959-0d987527f945',  -- Variedades Libres
      updated_at = NOW()
  WHERE id = 'a8628989-d634-48a4-b9fe-5e1cc231111c';  -- Tonda Giffoni

UPDATE contract_items
  SET genetic_program_id = 'd3125239-b7c3-41f0-8959-0d987527f945'
  WHERE variety_id = 'a8628989-d634-48a4-b9fe-5e1cc231111c'
    AND genetic_program_id IS NULL;

COMMIT;
