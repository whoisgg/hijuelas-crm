-- ============================================================
-- 00004_arandano_sekoya_ventura_to_fall_creek.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Las variedades Sekoya* y Ventura (Arándano) pertenecen al programa
-- genético "Fall Creek Genetics". Antes estaban sin programa asignado.
-- ============================================================

BEGIN;

UPDATE varieties
  SET genetic_program_id = '528bae4c-2738-4914-b01f-6ec83d9109dd',  -- Fall Creek Genetics
      updated_at = NOW()
  WHERE id IN (
    '12e7a30d-1ee3-4a4f-8f81-62ef27acad10',  -- Sekoya Crunch
    '5aa43842-627f-45b8-906f-0701abde594a',  -- Sekoya Fiesta
    '65447b0a-b1ed-4d85-a162-867c291bfef2',  -- Sekoya Grande
    'f855a884-0eb8-4de3-aa39-7d70729a71e4',  -- Sekoya Pop
    '572d45a1-0a7a-4a0e-a691-5c72b20963eb'   -- Ventura
  );

-- Sincronizar contract_items (por si ya existen items).
UPDATE contract_items
  SET genetic_program_id = '528bae4c-2738-4914-b01f-6ec83d9109dd'
  WHERE variety_id IN (
    '12e7a30d-1ee3-4a4f-8f81-62ef27acad10',
    '5aa43842-627f-45b8-906f-0701abde594a',
    '65447b0a-b1ed-4d85-a162-867c291bfef2',
    'f855a884-0eb8-4de3-aa39-7d70729a71e4',
    '572d45a1-0a7a-4a0e-a691-5c72b20963eb'
  )
    AND genetic_program_id IS NULL;

COMMIT;
