-- 00066 — Almendro/Castaño/Nogal sin semanas + duplicados de variedad pendientes
--
-- Decisiones del usuario (2026-07-31): Almendro/Castaño/Nogal quedaron con
-- 0 semanas en las 3 etapas desde que se crearon (migración 00054,
-- 2026-07-27) — nunca se llenaron, produciendo 4 lotes con end_week <
-- start_week (rooting_end = start+0-1 = start-1, y cada etapa siguiente
-- heredaba el mismo corrimiento). Se usa el mismo patrón que Cerezo/Ciruelo
-- (4/4/4 semanas).
--
-- Duplicados de variedad ya identificados el 30-jul (ver migración 00063,
-- Eureka Sunrise) resueltos hoy: FLR 12-11 (FLR1211 1 contrato vs FLRs 12-11
-- 3 contratos — misma variedad, se fusiona en la de más contratos), FLR
-- 14-372 (único candidato, sin ambigüedad), Ruby Chic/Ruby Chick 1714
-- (huérfanas, 0 contratos, la real es Ruby Chick con 17). OBG 16252/18064/
-- 20062 no tenían NINGÚN maestro que calzara (ni fuzzy) — se crean nuevos.

update planner_species
set rooting_weeks = 4, maturation_weeks = 4, predispatch_weeks = 4
where id in (10, 6, 11); -- Almendro, Castaño, Nogal

update planner_lots
set
  rooting_end_week = rooting_start_week + 3,
  maturation_start_week = rooting_start_week + 4,
  maturation_end_week = rooting_start_week + 7,
  predispatch_start_week = rooting_start_week + 8,
  predispatch_end_week = rooting_start_week + 11,
  end_week = rooting_start_week + 11
where lot_code in ('2026-26-CAS-MAR','2026-28-ALM-148','2026-28-ALM-AE2','2026-46-NOG-BAR');

insert into public.planner_lot_weeks (lot_id, campaign_week, area_id, stage, source)
select
  l.id, w.week,
  case
    when w.week between l.predispatch_start_week and l.predispatch_end_week then l.predispatch_area_id
    when w.week between l.maturation_start_week and l.maturation_end_week then l.maturation_area_id
    else l.rooting_area_id
  end,
  case
    when w.week between l.predispatch_start_week and l.predispatch_end_week then 'predespacho'
    when w.week between l.maturation_start_week and l.maturation_end_week then 'maduracion'
    else 'enraizamiento'
  end,
  'plan'
from planner_lots l
cross join lateral generate_series(l.rooting_start_week, l.predispatch_end_week) as w(week)
where l.lot_code in ('2026-26-CAS-MAR','2026-28-ALM-148','2026-28-ALM-AE2','2026-46-NOG-BAR')
on conflict (lot_id, campaign_week) do nothing;

-- FLR 12-11: fusiona FLR1211 (1 contrato) en FLRs 12-11 (3 contratos).
update contract_items set variety_id = '6e3153cc-51dd-4be5-b8da-dbcae6942ed4'
where variety_id = '9ad1ef76-486d-4190-8b5f-93e7d549a9a3';
update opportunity_items set variety_id = '6e3153cc-51dd-4be5-b8da-dbcae6942ed4'
where variety_id = '9ad1ef76-486d-4190-8b5f-93e7d549a9a3';
update planner_varieties set master_variety_id = '6e3153cc-51dd-4be5-b8da-dbcae6942ed4'
where master_variety_id = '9ad1ef76-486d-4190-8b5f-93e7d549a9a3';
update varieties set deleted_at = now() where id = '9ad1ef76-486d-4190-8b5f-93e7d549a9a3';

update planner_varieties set master_variety_id = '6e3153cc-51dd-4be5-b8da-dbcae6942ed4'
where id = 15; -- "FLR 12-11" del planner

-- FLR 14-372: único candidato, sin ambigüedad.
update planner_varieties set master_variety_id = 'fcb7be6e-c8f5-4ee6-967c-5e998f1e2ea7'
where id = 16;

-- Ruby Chic / Ruby Chick 1714 (huérfanas) → Ruby Chick (real, 17 contratos).
update planner_varieties set master_variety_id = '91dbb5b4-6b2d-4f87-b710-ce6855cf1dac'
where master_variety_id = 'f33f5107-404f-491f-b062-f21c6602f745';
update varieties set deleted_at = now()
where id in ('f33f5107-404f-491f-b062-f21c6602f745', '54880d7e-6a11-44da-988c-697c69d45142');

-- OBG 16252/18064/20062: sin maestro que calce — se crean nuevos.
insert into varieties (species_id, name)
values
  ('cacc1af5-fccc-438e-9985-ac2b74ec36b4', 'OBG 16252'),
  ('cacc1af5-fccc-438e-9985-ac2b74ec36b4', 'OBG 18064'),
  ('cacc1af5-fccc-438e-9985-ac2b74ec36b4', 'OBG 20062');

update planner_varieties pv
set master_variety_id = v.id
from varieties v
where v.deleted_at is null
and pv.id in (24, 25, 26)
and v.name = pv.name
and v.species_id = 'cacc1af5-fccc-438e-9985-ac2b74ec36b4';
