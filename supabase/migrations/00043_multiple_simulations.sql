-- Simulaciones múltiples: cada una es un grupo con nombre de órdenes what-if
-- con estado (borrador → evaluación → aprobado → descartado). Se cargan a
-- Ocupación solo desde "evaluacion" hacia adelante. Se elimina la restricción
-- de simulación única.
drop index if exists planner_scenarios_one_simulation;

comment on column planner_scenarios.is_simulation is
  'Simulación (overlay): grupo de órdenes extra que se suma al plan vigente en Ocupación cuando su estado es evaluacion o aprobado.';
