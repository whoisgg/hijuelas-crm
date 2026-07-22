-- Simulación como overlay: un único escenario compartido que contiene SOLO
-- órdenes extra (demanda what-if), sin copia del plan. La ocupación lo suma
-- al plan vigente cuando el usuario activa el checkbox "Incluir simulación".
alter table planner_scenarios
  add column if not exists is_simulation boolean not null default false;

-- Un solo escenario de simulación en todo el sistema (compartido).
create unique index if not exists planner_scenarios_one_simulation
  on planner_scenarios (is_simulation)
  where is_simulation;

comment on column planner_scenarios.is_simulation is
  'Escenario overlay de simulación (compartido): solo órdenes extra, se suma al plan vigente en Ocupación.';
