-- 00065 — planner_lot_weeks: ubicación real por (lote, semana de campaña)
--
-- Hoy un lote solo tiene 3 "paradas" fijas (enraizamiento/maduración/
-- predespacho); esta tabla da granularidad semana a semana, editable, para
-- que el usuario pueda registrar variaciones reales (source='manual')
-- distintas del plan derivado de esas 3 ventanas (source='plan') — y con
-- eso, más adelante, sacar protocolos reales por variedad (promedio de
-- semanas por etapa). Ver /planner/lotes/[id] y /planner/maestros?tab=protocolos.

create table public.planner_lot_weeks (
  id bigint generated always as identity primary key,
  lot_id integer not null references public.planner_lots(id) on delete cascade,
  campaign_week integer not null,
  area_id integer references public.planner_areas(id),
  stage text not null check (stage in ('enraizamiento','maduracion','predespacho')),
  source text not null default 'plan' check (source in ('plan','manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  unique (lot_id, campaign_week)
);

create index planner_lot_weeks_lot_id_idx on public.planner_lot_weeks(lot_id);

alter table public.planner_lot_weeks enable row level security;

create policy planner_lot_weeks_rw on public.planner_lot_weeks
  for all
  using (current_user_role() = any (array['admin','produccion']::user_role[]))
  with check (current_user_role() = any (array['admin','produccion']::user_role[]));

-- Backfill de los lotes existentes: una fila por semana dentro de la ventana
-- total del lote, área/etapa según en cuál de las 3 ventanas cae la semana.
-- 4 lotes con end_week < start_week (dato corrupto preexistente, no
-- relacionado a esta migración) quedan sin filas — generate_series vacío,
-- no se inventa nada.
insert into public.planner_lot_weeks (lot_id, campaign_week, area_id, stage, source)
select
  l.id,
  w.week,
  case
    when l.predispatch_area_id is not null and l.predispatch_start_week is not null and l.predispatch_end_week is not null and w.week between l.predispatch_start_week and l.predispatch_end_week then l.predispatch_area_id
    when l.maturation_area_id is not null and l.maturation_start_week is not null and l.maturation_end_week is not null and w.week between l.maturation_start_week and l.maturation_end_week then l.maturation_area_id
    when l.rooting_area_id is not null and l.rooting_start_week is not null and l.rooting_end_week is not null and w.week between l.rooting_start_week and l.rooting_end_week then l.rooting_area_id
    else coalesce(l.predispatch_area_id, l.maturation_area_id, l.rooting_area_id)
  end as area_id,
  case
    when l.predispatch_area_id is not null and l.predispatch_start_week is not null and l.predispatch_end_week is not null and w.week between l.predispatch_start_week and l.predispatch_end_week then 'predespacho'
    when l.maturation_area_id is not null and l.maturation_start_week is not null and l.maturation_end_week is not null and w.week between l.maturation_start_week and l.maturation_end_week then 'maduracion'
    when l.rooting_area_id is not null and l.rooting_start_week is not null and l.rooting_end_week is not null and w.week between l.rooting_start_week and l.rooting_end_week then 'enraizamiento'
    else (case
      when l.predispatch_area_id is not null then 'predespacho'
      when l.maturation_area_id is not null then 'maduracion'
      else 'enraizamiento'
    end)
  end as stage,
  'plan'
from public.planner_lots l
cross join lateral generate_series(
  least(l.start_week, l.rooting_start_week, l.maturation_start_week, l.predispatch_start_week),
  greatest(l.end_week, l.rooting_end_week, l.maturation_end_week, l.predispatch_end_week)
) as w(week)
on conflict (lot_id, campaign_week) do nothing;
