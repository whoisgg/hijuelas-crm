-- Aprobar la mesa de trabajo: reemplaza el plan vigente (planner_lots) con los
-- lotes del escenario de trabajo del usuario, en una sola transacción. Solo un
-- escenario is_working puede aprobarse — las simulaciones y escenarios sueltos
-- nunca pisan el plan. SECURITY INVOKER: la RLS de planner_lots (admin y
-- produccion) sigue mandando.

create or replace function planner_apply_scenario_to_plan(p_scenario_id integer)
returns integer
language plpgsql
as $$
declare
  v_count integer;
begin
  if not exists (
    select 1 from planner_scenarios where id = p_scenario_id and is_working
  ) then
    raise exception 'Solo la mesa de trabajo puede aprobarse al plan.';
  end if;

  -- pg_safeupdate exige WHERE aunque el reemplazo sea total
  delete from planner_lots where id is not null;

  insert into planner_lots (
    lot_code, species_id, variety_id, year, start_week, plants,
    tray_format, trays, rooting_area_id, rooting_weeks, rooting_start_week,
    rooting_end_week, maturation_area_id, maturation_weeks,
    maturation_start_week, maturation_end_week, predispatch_area_id,
    predispatch_weeks, predispatch_start_week, predispatch_end_week,
    end_week, status
  )
  select
    lot_code, species_id, variety_id, year, start_week, plants,
    tray_format, trays, rooting_area_id, rooting_weeks, rooting_start_week,
    rooting_end_week, maturation_area_id, maturation_weeks,
    maturation_start_week, maturation_end_week, predispatch_area_id,
    predispatch_weeks, predispatch_start_week, predispatch_end_week,
    end_week, status
  from planner_scenario_lots
  where scenario_id = p_scenario_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
