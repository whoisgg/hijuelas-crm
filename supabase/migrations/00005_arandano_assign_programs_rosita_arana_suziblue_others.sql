-- ============================================================
-- 00005_arandano_assign_programs_rosita_arana_suziblue_others.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Asignaciones de programa genético para 11 variedades Arándano:
--  - Rosita, Arana → Driscolls
--  - Suziblue → Georgia (programa nuevo, University of Georgia)
--  - Arabella Blue, Atlasblue, AzraBlue, BiancaBlue, Cargo, Luna Blue,
--    Olympus Blue, Peachy Blue → Fall Creek Genetics
-- ============================================================

BEGIN;

-- 1) Crear programa Georgia
INSERT INTO genetic_programs (name, default_royalty_pct, default_royalty_per_plant)
VALUES ('Georgia', 0, 0)
ON CONFLICT DO NOTHING;

-- 2) Rosita + Arana → Driscolls
UPDATE varieties
  SET genetic_program_id = '3803b4eb-0b85-429d-b54a-987b15923fc6',  -- Driscolls
      updated_at = NOW()
  WHERE id IN (
    '7907ebe9-9251-45e3-ac04-50b76bc70d4c',  -- Rosita
    'ef767966-ec7f-44bf-85aa-f5060afc09f1'   -- Arana
  );

-- 3) Suziblue → Georgia (lookup por name del recién creado)
UPDATE varieties
  SET genetic_program_id = (SELECT id FROM genetic_programs WHERE name = 'Georgia'),
      updated_at = NOW()
  WHERE id = 'c25619db-7883-497f-ab80-762f80248e37';  -- Suziblue

-- 4) El resto → Fall Creek Genetics
UPDATE varieties
  SET genetic_program_id = '528bae4c-2738-4914-b01f-6ec83d9109dd',  -- Fall Creek Genetics
      updated_at = NOW()
  WHERE id IN (
    '8aba5f45-df1d-4a54-b500-008dd76fc26e',  -- Arabella Blue
    'b43d4d25-b9b9-4918-b422-635dac28da4c',  -- Atlasblue
    'baf94fd4-1112-4b30-b549-759e92a3a5c9',  -- AzraBlue
    '83b5067b-19fc-4482-8b54-d22cfa2287fe',  -- BiancaBlue
    'd38da9e8-38a3-437f-a9aa-ac2a6da6a4a8',  -- Cargo
    'ded4d61a-add8-4b42-9e42-1ff4ac0f6c75',  -- Luna Blue
    '8c6d300e-92f8-4cba-b2fc-3393e0b47bee',  -- Olympus Blue
    '67a14735-aba8-4ae4-b0b0-3a764c0806b2'   -- Peachy Blue
  );

-- 5) Sincronizar contract_items.genetic_program_id donde apunta a NULL
UPDATE contract_items ci
  SET genetic_program_id = v.genetic_program_id
  FROM varieties v
  WHERE ci.variety_id = v.id
    AND ci.variety_id IN (
      '7907ebe9-9251-45e3-ac04-50b76bc70d4c',
      'ef767966-ec7f-44bf-85aa-f5060afc09f1',
      'c25619db-7883-497f-ab80-762f80248e37',
      '8aba5f45-df1d-4a54-b500-008dd76fc26e',
      'b43d4d25-b9b9-4918-b422-635dac28da4c',
      'baf94fd4-1112-4b30-b549-759e92a3a5c9',
      '83b5067b-19fc-4482-8b54-d22cfa2287fe',
      'd38da9e8-38a3-437f-a9aa-ac2a6da6a4a8',
      'ded4d61a-add8-4b42-9e42-1ff4ac0f6c75',
      '8c6d300e-92f8-4cba-b2fc-3393e0b47bee',
      '67a14735-aba8-4ae4-b0b0-3a764c0806b2'
    )
    AND ci.genetic_program_id IS NULL
    AND v.genetic_program_id IS NOT NULL;

COMMIT;
