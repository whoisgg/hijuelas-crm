-- ============================================================
-- 00002_cleanup_avellano_varieties.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Cleanup variedades Avellano (Hazelnut):
--   1) Merge duplicados por capitalización/acento/espacio:
--      - Doris → Dorris
--      - Polly + Polly O → PollyO
--      - Tonda + Tonda Pacífica → Tonda Pacifica
--   2) Asignar programa genético OSU a todas las variedades Avellano
--      sin programa, EXCEPTO Tonda Giffoni (italiana, no OSU).
--   3) Barcelona mantiene "Variedades Libres" (no es OSU).
--   4) Sincronizar contract_items.genetic_program_id con la variedad
--      donde estaba NULL (para que el ranking del dashboard incluya
--      estas plantas en el bucket OSU).
-- ============================================================

BEGIN;

-- A) Mover contract_items hacia la variedad canónica
UPDATE contract_items SET variety_id = '3e000bd3-4493-4841-94f4-a5a82ce316c7'  -- Dorris
  WHERE variety_id = '4e959024-7cc1-4484-9353-291e101c8045';                   -- Doris
UPDATE contract_items SET variety_id = '27d580f7-8953-401a-bb3f-fa4092f0890a'  -- PollyO
  WHERE variety_id = '12a6e898-ec01-4634-811a-564262f319eb';                   -- Polly
UPDATE contract_items SET variety_id = '27d580f7-8953-401a-bb3f-fa4092f0890a'  -- PollyO
  WHERE variety_id = 'c2d53989-eba5-4f88-87a1-b06c3cf50e4d';                   -- Polly O
UPDATE contract_items SET variety_id = '0d0e2b31-1799-44f5-b934-89b01f457a6d'  -- Tonda Pacifica
  WHERE variety_id = '831de775-f856-4433-a7f7-fba7d393d743';                   -- Tonda
UPDATE contract_items SET variety_id = '0d0e2b31-1799-44f5-b934-89b01f457a6d'  -- Tonda Pacifica
  WHERE variety_id = 'f05f802c-99e1-43e8-a9b0-d2b8ca2edbaa';                   -- Tonda Pacífica

-- B) Soft-delete las variedades duplicadas
UPDATE varieties SET deleted_at = NOW()
  WHERE id IN (
    '4e959024-7cc1-4484-9353-291e101c8045',  -- Doris
    '12a6e898-ec01-4634-811a-564262f319eb',  -- Polly
    'c2d53989-eba5-4f88-87a1-b06c3cf50e4d',  -- Polly O
    '831de775-f856-4433-a7f7-fba7d393d743',  -- Tonda
    'f05f802c-99e1-43e8-a9b0-d2b8ca2edbaa'   -- Tonda Pacífica
  );

-- C) Asignar OSU a variedades sin programa (excepto Tonda Giffoni)
UPDATE varieties
  SET genetic_program_id = 'dea2c467-f60c-49f3-b12c-bdb3ecf49ce9',  -- OSU
      updated_at = NOW()
  WHERE species_id = '4c12eb17-48f0-4979-8bfd-1bfc35d69b72'  -- Avellano
    AND deleted_at IS NULL
    AND genetic_program_id IS NULL
    AND id != 'a8628989-d634-48a4-b9fe-5e1cc231111c';  -- Tonda Giffoni excluida

-- D) Sincronizar contract_items.genetic_program_id con la variedad
--    donde el item lo tenía en NULL.
UPDATE contract_items ci
  SET genetic_program_id = v.genetic_program_id
  FROM varieties v
  WHERE ci.variety_id = v.id
    AND v.species_id = '4c12eb17-48f0-4979-8bfd-1bfc35d69b72'
    AND v.deleted_at IS NULL
    AND v.genetic_program_id IS NOT NULL
    AND ci.genetic_program_id IS NULL;

COMMIT;

-- Pendientes detectados (para futura migración):
--   - Arándano: "Eureka sunrise" (2) vs "Eureka Sunrise" (23)
--   - Arándano: "FL 17-023" vs "FL17-023", "FL 22-0333" vs "FL22-0333"
--   - Mora: "LBA 19-41-13" vs "LBA19-41-13", "LBA 19-41-15" vs "LBA19-41-15",
--          "LBA 19-49-08" vs "LBA19-49-08"
