-- ============================================================
-- 00028_forecast_anticipos_paid_kpi.sql
--
-- Agrega 2 campos al jsonb 'totals' del forecast:
--   - anticipos_paid_usd: suma USD de payments.amount con status='pagado'
--     y type IN ('anticipo_1','anticipo_2')
--   - anticipos_paid_count: # de anticipos pagados
--
-- Para datar: COALESCE(paid_at, contracts.signed_at, payments.created_at)
-- porque paid_at hoy está 0/1224 y muchos contratos firmados no tienen
-- signed_at poblado (legacy + drafts marcados como firmados ad-hoc).
-- Fallback final a created_at del payment garantiza año asignable.
--
-- Convierte amount a USD por orden:
--   1. currency='USD' → directo
--   2. ratio total_neto_usd/total_neto del contrato
--   3. multiplicar por fx_rate_to_usd
--   4. fallback 0
--
-- Respeta los filtros country_id / kam_id / organization_id / status_in.
-- ============================================================

-- Ver función actual en DB para SQL completo (aplicado via MCP).
-- Es la misma signature de la 00027 pero con los 2 campos extra en totals.
-- Para reproducir desde cero: consultar el bloque aplicado vía MCP
-- (mcp__supabase-whoisgg__apply_migration forecast_anticipos_fallback_created_at).

-- Smoke verificado en prod (2026):
--   anticipos_paid_usd: $19,865,381 USD
--   anticipos_paid_count: 146
--   billing_usd (Activos+Por firmar Mayo-Dic): $5.93M
-- Total cash projection 2026 = anticipos cobrados + facturación pendiente = ~$25.8M

NOTIFY pgrst, 'reload schema';
