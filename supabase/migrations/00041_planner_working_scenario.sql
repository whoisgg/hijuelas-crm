-- Mesa de trabajo "invisible" del planner: un escenario sandbox por usuario
-- donde caen los movimientos del plano sin tocar el plan real. El índice único
-- parcial garantiza como máximo UNA mesa de trabajo por usuario, evitando los
-- duplicados que el prefetch de Next generaba con un get-or-create no atómico.

alter table planner_scenarios
  add column if not exists is_working boolean not null default false;

create unique index if not exists planner_scenarios_one_working_per_user
  on planner_scenarios (created_by) where is_working;
