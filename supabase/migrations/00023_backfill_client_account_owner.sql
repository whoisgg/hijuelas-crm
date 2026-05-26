-- ============================================================
-- 00023_backfill_client_account_owner.sql
--
-- Los 153 clientes tenían account_owner_id = null porque la carga
-- inicial vino del Excel sin el campo KAM a nivel cliente. El KAM
-- real vivía en contracts.kam_id pero no se replicaba al cliente.
-- Resultado: el módulo /kam, la ficha pública compartida y las tools
-- MCP que filtran por kam_id mostraban "Sin KAM asignado".
--
-- Backfill: para cada cliente sin account_owner, asignar el KAM
-- con más contratos (tie-break: mayor total USD). Ignora contratos
-- cancelados y eliminados.
--
-- Trigger: cuando se crea o actualiza un contrato con kam_id, si el
-- cliente todavía no tiene account_owner_id, se lo asigna. No
-- sobrescribe un KAM ya asignado (consistencia hacia adelante sin
-- ser invasivo).
--
-- Resultado tras backfill: 96 de 153 clientes con KAM (los 57
-- restantes son prospectos sin contratos firmados). Distribución:
--   Searle 36, Sannazzaro 25, Vidal 17, Rojas 14, Goycoolea 3, Mohr 1.
-- ============================================================

WITH client_kam_ranking AS (
  SELECT
    ct.client_id,
    ct.kam_id,
    COUNT(*) AS contracts_count,
    COALESCE(SUM(ct.total_neto_usd), 0) AS total_usd,
    ROW_NUMBER() OVER (
      PARTITION BY ct.client_id
      ORDER BY COUNT(*) DESC, COALESCE(SUM(ct.total_neto_usd), 0) DESC
    ) AS rn
  FROM public.contracts ct
  WHERE ct.deleted_at IS NULL
    AND ct.kam_id IS NOT NULL
    AND ct.status::text <> 'cancelado'
  GROUP BY ct.client_id, ct.kam_id
),
winner_per_client AS (
  SELECT client_id, kam_id FROM client_kam_ranking WHERE rn = 1
)
UPDATE public.clients c
SET account_owner_id = w.kam_id,
    updated_at = now()
FROM winner_per_client w
WHERE c.id = w.client_id
  AND c.account_owner_id IS NULL
  AND c.deleted_at IS NULL;

-- Trigger: auto-asignar KAM al cliente cuando se crea/edita un contrato.
CREATE OR REPLACE FUNCTION public._sync_client_account_owner_from_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.kam_id IS NOT NULL AND NEW.client_id IS NOT NULL THEN
    UPDATE public.clients
      SET account_owner_id = NEW.kam_id, updated_at = now()
      WHERE id = NEW.client_id
        AND account_owner_id IS NULL
        AND deleted_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_client_account_owner_from_contract ON public.contracts;
CREATE TRIGGER sync_client_account_owner_from_contract
  AFTER INSERT OR UPDATE OF kam_id ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public._sync_client_account_owner_from_contract();

NOTIFY pgrst, 'reload schema';
