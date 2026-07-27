-- 00052 — Completar planner_calendar_weeks más allá del borde de año (2027 S1-S11)
--
-- Problema detectado el 2026-07-27 en /planner/movimientos: las últimas semanas
-- del plan salían rotuladas `SC54`…`SC64` en vez de "S1 · 2027", porque
-- `planner_calendar_weeks` solo tenía las 53 semanas de campaña de 2026 mientras
-- los lotes activos llegan hasta la semana de campaña **64**.
--
-- El rótulo feo era el síntoma menor. El grave: el cruce con el CRM en
-- `movimientos-data.ts` resuelve la semana real vía `realWeekOf(campaign_week)`,
-- que devolvía null para esas semanas → `matchesFor()` retornaba `[]` y **21
-- despachos (9.220 bandejas / 2,5M plantas) nunca podían asociarse a un
-- contrato**, aunque el contrato existiera. Fallaba en silencio.
--
-- No es una decisión de negocio: `campaign_week` es 1:1 la semana ISO de 2026
-- (cw 1 = 2026-W01, arranca 2025-12-29; cw 53 = 2026-W53, termina 2027-01-03).
-- Entonces cw 54..64 son simplemente 2027 W1..W11. La tabla se había cortado en
-- el cambio de año.
--
-- `month_name` sigue la convención de las filas existentes: mes (en español) del
-- jueves de la semana = start_date + 3 días.
-- Idempotente: no reinserta si la semana de campaña ya existe.

insert into public.planner_calendar_weeks (year, week, campaign_week, start_date, end_date, month_name)
select
  2027,
  n,
  53 + n,
  d.start_date,
  d.start_date + 6,
  (array[
    'Enero','Febrero','Marzo','Abril','Mayo','Junio',
    'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'
  ])[extract(month from d.start_date + 3)::int]
from generate_series(1, 11) as n
cross join lateral (
  -- 2027-01-04 = lunes de la semana ISO 1 de 2027
  select date '2027-01-04' + (n - 1) * 7 as start_date
) d
where not exists (
  select 1 from public.planner_calendar_weeks c where c.campaign_week = 53 + n
);

notify pgrst, 'reload schema';
