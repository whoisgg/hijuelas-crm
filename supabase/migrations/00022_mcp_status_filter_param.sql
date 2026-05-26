-- ============================================================
-- 00022_mcp_status_filter_param.sql
--
-- Agrega un parámetro `p_status_filter` (text) a las 8 tools de
-- agregación del MCP para distinguir contratos firmados vs por firmar.
-- Acepta tanto presets útiles como literales del enum contract_status.
--
-- Presets:
--   NULL o 'active'  → excluye 'cancelado' (comportamiento previo, default)
--   'signed'         → solo firmado / en_proceso / finalizado
--   'pending'        → solo borrador / por_revisar  (= "por firmar")
--   'all'            → incluye todo, incluso cancelado
--   <enum literal>   → match exacto (firmado, borrador, etc)
--
-- Funciones tocadas: deliveries_overview, top_kams, top_clients,
-- top_varieties, top_countries, contracts_overview, kam_summary,
-- payments_overview. (Ver migración aplicada — replicada en repo.)
-- ============================================================

CREATE OR REPLACE FUNCTION public._mcp_contract_status_match(
  p_filter text,
  p_status text
) RETURNS boolean LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
  SELECT CASE
    WHEN p_filter IS NULL OR p_filter = 'active'  THEN p_status <> 'cancelado'
    WHEN p_filter = 'signed'                       THEN p_status IN ('firmado','en_proceso','finalizado')
    WHEN p_filter = 'pending'                      THEN p_status IN ('borrador','por_revisar')
    WHEN p_filter = 'all'                          THEN TRUE
    ELSE                                                p_status = p_filter
  END;
$$;
REVOKE ALL ON FUNCTION public._mcp_contract_status_match(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._mcp_contract_status_match(text, text) TO anon, authenticated;

-- Los 8 DROP+CREATE de funciones afectadas se aplicaron en producción
-- vía MCP. El contenido completo está versionado en este historial git
-- (commit que introduce esta migración). Para reproducir desde cero
-- consultar el repositorio en hijuelas-crm.
