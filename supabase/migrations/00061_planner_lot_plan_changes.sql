-- 00061 — Historial de modificaciones del plan por lote (Movimientos: vista única)
--
-- Antes "Planificado" se derivaba en vivo de planner_lots sin dejar rastro de
-- que un lote cambió de semana/área tras la carga inicial. Esta tabla es el
-- registro append-only de esos cambios: cada edición (manual desde
-- /planner/lotes o una nueva carga del Excel) escribe una fila por campo
-- modificado, agrupadas por change_batch_id (una edición = un batch = "una
-- modificación" en la UI de Movimientos).
--
-- Append-only de verdad: la RLS solo define SELECT e INSERT, sin UPDATE ni
-- DELETE — "no hay eliminación del plan, solo reversa o modificación" se
-- cumple a nivel de base de datos, no solo por convención de la app.
--
-- Se referencia por lot_code (no lot_id): cada carga hace DELETE+INSERT
-- completo de planner_lots (import-core.ts applyPlannerCore), así que el id
-- numérico no sobrevive entre cargas — lot_code sí.

create table public.planner_lot_plan_changes (
  id bigint generated always as identity primary key,
  lot_code text not null,
  change_batch_id uuid not null,
  source text not null check (source in ('manual', 'carga')),
  field text not null,
  old_value text,
  new_value text,
  changed_by uuid references public.app_users(id) on delete set null,
  upload_id uuid references public.planner_uploads(id) on delete set null,
  created_at timestamptz not null default now()
);

create index planner_lot_plan_changes_lot_idx
  on public.planner_lot_plan_changes (lot_code, created_at desc);
create index planner_lot_plan_changes_batch_idx
  on public.planner_lot_plan_changes (change_batch_id);

comment on table public.planner_lot_plan_changes is
  'Append-only: nunca se actualiza ni se borra (sin policy de UPDATE/DELETE). Una edición (manual o carga) = un change_batch_id con una fila por campo modificado.';

alter table public.planner_lot_plan_changes enable row level security;

-- Mismo criterio que el resto de Planner (ver planner_lots_rw): admin/
-- producción de la fase de transición de roles. La escritura real además
-- queda acotada a nivel de aplicación a module_access.level = 'admin'
-- (requireModuleAccess "planner","admin") — más fino que este check, que es
-- el piso de RLS compartido con el resto de las tablas del módulo.
create policy planner_lot_plan_changes_select on public.planner_lot_plan_changes
  for select
  using (current_user_role() = any (array['admin'::user_role, 'produccion'::user_role]));

create policy planner_lot_plan_changes_insert on public.planner_lot_plan_changes
  for insert
  with check (current_user_role() = any (array['admin'::user_role, 'produccion'::user_role]));

notify pgrst, 'reload schema';
