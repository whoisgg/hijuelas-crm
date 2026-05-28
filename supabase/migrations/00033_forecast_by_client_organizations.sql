-- ============================================================
-- 00033_forecast_by_client_organizations.sql
--
-- Agrega `organizations text[]` por (cliente, mes) en el subarray
-- `by_client` del jsonb de `mcp_forecast_by_month`.
--
-- Es ARRAY_AGG(DISTINCT COALESCE(org.contract_prefix, org.name)) — usa
-- el prefijo del contrato (VHSA, VH, ZOE, SJL, IVL, etc.) por compacidad
-- en la UI; cae al name completo si el prefix está vacío.
--
-- Un cliente puede tener contratos elegibles en varias orgs durante un
-- mes (raro pero posible — p.ej. la misma empresa firma con VHSA y con
-- ZOE en abriles distintos). Por eso es array, no scalar.
--
-- Aplicado vía mcp__supabase-whoisgg__apply_migration con name
-- 'forecast_by_client_organizations'. Ver función en DB para el SQL.
-- ============================================================

NOTIFY pgrst, 'reload schema';
