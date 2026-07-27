-- 00058 — Origen del lote (vitro / cutting) + parentela del cutting
--
-- Cierra el pedido del usuario: "el origen es importante tenerlo del lote, si
-- vino del laboratorio del ingreso original o se genero por multiplicacion".
--
-- ⚠️ CORRECCIÓN a la nota de diseño del vault: ahí escribí que "Arándano Cutting"
-- era una especie fantasma que colapsaba a Arándano + origen=cutting. **Es más
-- que un nombre**: tiene una ficha de cultivo distinta —
--
--     Arándano          enraiz. 6 sem · madur. 7 · predesp. 4  (17 total)
--     Arándano Cutting  enraiz. 8 sem · madur. 6 · predesp. 4  (18 total)
--
-- Colapsarla habría hecho que el plan calculara mal las semanas de etapa de los
-- lotes de cutting. `planner_species` no es "especies": es **fichas de cultivo**
-- (qué área y cuántas semanas por etapa).
--
-- Tampoco se renombra la ficha a "Arándano": quedarían DOS filas con el mismo
-- nombre y el importador de inventario —que mapea especies por nombre
-- normalizado— las confundiría. Se conserva el nombre de la ficha y se agrega
-- el `origen` como campo propio, que es lo que hacía falta.
--
-- Lo que sí se limpia: el vínculo al maestro (la ficha cutting no tenía) y el
-- prefijo "Cutting " de sus 7 variedades.

-- ── 1. Origen en la ficha de cultivo ────────────────────────────────────────
alter table public.planner_species
  add column if not exists origen text not null default 'vitro';

alter table public.planner_species drop constraint if exists planner_species_origen_check;
alter table public.planner_species add constraint planner_species_origen_check
  check (origen in ('vitro','cutting'));

update public.planner_species
set origen = 'cutting'
where name ilike '%cutting%';

-- La ficha cutting no tenía vínculo al maestro: es Arándano en el catálogo del
-- CRM, así que los reportes comerciales deben consolidar ahí.
update public.planner_species ps
set master_species_id = (
  select s.id from public.species s
  where lower(s.name) = 'arándano' and s.deleted_at is null limit 1
)
where ps.master_species_id is null
  and ps.name ilike 'arándano cutting%';

-- ── 2. Variedades: fuera el prefijo "Cutting " ──────────────────────────────
-- El origen ya vive en la ficha, así que el prefijo era información duplicada en
-- el nombre. Seguro: `planner_varieties` es único por (species_id, name) y la
-- ficha cutting es una especie distinta de Arándano.
update public.planner_varieties
set name = regexp_replace(name, '^[Cc]utting\s+', '')
where species_id in (select id from public.planner_species where origen = 'cutting')
  and name ~* '^cutting\s+';

-- ── 3. Origen y parentela en el lote ────────────────────────────────────────
alter table public.planner_lots
  add column if not exists origen text not null default 'vitro',
  add column if not exists parent_lot_id integer references public.planner_lots(id) on delete set null;

alter table public.planner_lots drop constraint if exists planner_lots_origen_check;
alter table public.planner_lots add constraint planner_lots_origen_check
  check (origen in ('vitro','cutting'));

create index if not exists planner_lots_parent_idx on public.planner_lots (parent_lot_id);

-- Los escenarios (mesa de trabajo y simulaciones) son copias del plan: el origen
-- tiene que viajar con ellas. `parent_lot_id` NO se replica: apunta a
-- `planner_lots` y en un escenario no tendría sentido.
alter table public.planner_scenario_lots
  add column if not exists origen text not null default 'vitro';

alter table public.planner_scenario_lots drop constraint if exists planner_scenario_lots_origen_check;
alter table public.planner_scenario_lots add constraint planner_scenario_lots_origen_check
  check (origen in ('vitro','cutting'));

-- ── 4. Backfill: el lote hereda el origen de su ficha ───────────────────────
update public.planner_lots l
set origen = ps.origen
from public.planner_varieties v
join public.planner_species ps on ps.id = v.species_id
where v.id = l.variety_id and l.origen <> ps.origen;

update public.planner_scenario_lots sl
set origen = ps.origen
from public.planner_varieties v
join public.planner_species ps on ps.id = v.species_id
where v.id = sl.variety_id and sl.origen <> ps.origen;

-- ── 5. Las funciones de copia enumeran columnas: hay que incluir `origen` ───
-- Sin esto, copiar el plan a la mesa de trabajo o aprobarla de vuelta perdería
-- el origen silenciosamente.
create or replace function public.planner_copy_lots_to_scenario(p_scenario_id integer)
returns integer
language sql
set search_path = public, pg_temp
as $$
  insert into planner_scenario_lots (
    scenario_id, lot_code, species_id, variety_id, year, start_week, plants,
    tray_format, trays, rooting_area_id, rooting_weeks, rooting_start_week,
    rooting_end_week, maturation_area_id, maturation_weeks,
    maturation_start_week, maturation_end_week, predispatch_area_id,
    predispatch_weeks, predispatch_start_week, predispatch_end_week,
    end_week, status, origen
  )
  select
    p_scenario_id, lot_code, species_id, variety_id, year, start_week, plants,
    tray_format, trays, rooting_area_id, rooting_weeks, rooting_start_week,
    rooting_end_week, maturation_area_id, maturation_weeks,
    maturation_start_week, maturation_end_week, predispatch_area_id,
    predispatch_weeks, predispatch_start_week, predispatch_end_week,
    end_week, status, origen
  from planner_lots;
  select count(*)::int from planner_scenario_lots where scenario_id = p_scenario_id;
$$;

create or replace function public.planner_apply_scenario_to_plan(p_scenario_id integer)
returns integer
language plpgsql
set search_path = public, pg_temp
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
    end_week, status, origen
  )
  select
    lot_code, species_id, variety_id, year, start_week, plants,
    tray_format, trays, rooting_area_id, rooting_weeks, rooting_start_week,
    rooting_end_week, maturation_area_id, maturation_weeks,
    maturation_start_week, maturation_end_week, predispatch_area_id,
    predispatch_weeks, predispatch_start_week, predispatch_end_week,
    end_week, status, origen
  from planner_scenario_lots
  where scenario_id = p_scenario_id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.planner_copy_lots_to_scenario(integer) from public, anon;
grant execute on function public.planner_copy_lots_to_scenario(integer) to authenticated;
revoke all on function public.planner_apply_scenario_to_plan(integer) from public, anon;
grant execute on function public.planner_apply_scenario_to_plan(integer) to authenticated;

notify pgrst, 'reload schema';
