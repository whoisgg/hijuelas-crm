-- ============================================================
-- 00011_consolidate_opportunity_stages_to_six.sql
-- Aplicada vía Supabase MCP el 2026-05-25.
--
-- Reduce los 7 stages originales a 6 (4 activas + Ganada + Perdida).
-- Cada uno con exit criterion claro y artefacto observable.
--
-- Old (7): Prospeccion 10%, Calificada 25%, Propuesta enviada 50%,
--          Negociacion 70%, Verbal commit 90%, Ganada 100%, Perdida 0%.
--
-- New (6): Interes 15%, Propuesta 45%, Negociacion 75%,
--          Por firmar 90%, Ganada 100%, Perdida 0%.
--
-- Racional:
--   - "Prospeccion" vs "Calificada" se fundían en uso real → merge
--     en "Interes" con exit criterion: variedad + qty + plazo confirmados.
--   - "Verbal commit" vs "Negociacion" eran difusos → reemplazo por
--     "Por firmar" (artefacto: acuerdo cerrado, pendiente firma).
--   - "Propuesta enviada" → "Propuesta" (artefacto: PDF adjunto).
--
-- Hard-delete safe: el script aborta si existen oportunidades.
-- ============================================================

BEGIN;

-- Guardrail
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.opportunities WHERE deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Hay oportunidades activas. No se puede consolidar stages sin migrar primero.';
  END IF;
END $$;

DELETE FROM public.opportunity_stages;

INSERT INTO public.opportunity_stages
  (name, color, order_index, is_won, is_lost, probability_default)
VALUES
  ('Interes',      '#94a3b8', 1, false, false, 15),
  ('Propuesta',    '#a78bfa', 2, false, false, 45),
  ('Negociacion',  '#f59e0b', 3, false, false, 75),
  ('Por firmar',   '#10b981', 4, false, false, 90),
  ('Ganada',       '#16a34a', 5, true,  false, 100),
  ('Perdida',      '#dc2626', 6, false, true,  0);

COMMIT;
