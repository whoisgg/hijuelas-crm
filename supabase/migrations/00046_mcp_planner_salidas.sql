-- Tool MCP nueva: salidas programadas del planner (cambios de sección entre
-- etapas y despachos finales) con el cruce a contratos del CRM vía la
-- variedad maestra — espejo de la vista /planner/salidas.

create or replace function public.mcp_planner_salidas(
  p_user_id uuid,
  p_semanas integer default 8,
  p_tipo text default null
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_cw int;
  result jsonb;
begin
  if not mcp_planner_role_ok(p_user_id) then
    return jsonb_build_object('error', 'Sin permisos para el Planner');
  end if;
  if p_tipo is not null and p_tipo not in ('despacho', 'cambio_seccion') then
    return jsonb_build_object('error', 'p_tipo debe ser despacho o cambio_seccion');
  end if;

  select campaign_week into v_cw
    from planner_calendar_weeks
    where current_date between start_date and end_date
    limit 1;
  v_cw := coalesce(v_cw, 0);

  with ev as (
    select l.id, l.lot_code, l.trays, l.plants, l.rooting_end_week as cw,
           'cambio_seccion'::text as tipo,
           l.rooting_area_id as from_area, l.maturation_area_id as to_area
      from planner_lots l
      where l.status = 'ACTIVO'
        and l.rooting_end_week is not null and l.maturation_area_id is not null
    union all
    select l.id, l.lot_code, l.trays, l.plants, l.maturation_end_week,
           'cambio_seccion', l.maturation_area_id, l.predispatch_area_id
      from planner_lots l
      where l.status = 'ACTIVO'
        and l.maturation_end_week is not null and l.predispatch_area_id is not null
    union all
    select l.id, l.lot_code, l.trays, l.plants,
           coalesce(l.predispatch_end_week, l.end_week, l.maturation_end_week),
           'despacho',
           coalesce(l.predispatch_area_id, l.maturation_area_id, l.rooting_area_id),
           null
      from planner_lots l
      where l.status = 'ACTIVO'
        and coalesce(l.predispatch_end_week, l.end_week, l.maturation_end_week) is not null
  )
  select coalesce(jsonb_agg(jsonb_build_object(
      'semana_campana', ev.cw,
      'semana', cal.week,
      'anio', cal.year,
      'tipo', ev.tipo,
      'lote', ev.lot_code,
      'especie', ps.name,
      'variedad', pv.name,
      'bandejas', ev.trays,
      'plantas', ev.plants,
      'desde', fa.name,
      'hacia', ta.name,
      'contratos', case when ev.tipo = 'despacho' then coalesce((
          select jsonb_agg(jsonb_build_object(
            'numero', c.number,
            'cliente', cl.name,
            'semana_entrega', ci.delivery_week,
            'plantas', ci.qty_plants
          ))
          from contract_items ci
          join contracts c on c.id = ci.contract_id and c.deleted_at is null
          join clients cl on cl.id = c.client_id
          where ci.deleted_at is null
            and pv.master_variety_id is not null
            and ci.variety_id = pv.master_variety_id
            and ci.delivery_year = cal.year
            and (ci.delivery_week is null or abs(ci.delivery_week - cal.week) <= 2)
        ), '[]'::jsonb) else null end
    ) order by ev.cw, ev.tipo desc, ev.trays desc), '[]'::jsonb)
  into result
  from ev
  join planner_lots l on l.id = ev.id
  join planner_species ps on ps.id = l.species_id
  left join planner_varieties pv on pv.id = l.variety_id
  left join planner_areas fa on fa.id = ev.from_area
  left join planner_areas ta on ta.id = ev.to_area
  left join planner_calendar_weeks cal on cal.campaign_week = ev.cw
  where ev.cw >= v_cw
    and ev.cw <= v_cw + greatest(1, least(coalesce(p_semanas, 8), 70))
    and (p_tipo is null or ev.tipo = p_tipo);

  return result;
end;
$$;
