-- 00062 — plant_code en planner_lots
--
-- Texto referencial del laboratorio (ej. código de lote de Alstro) sobre un
-- lote del Vivero Planner. No es un vínculo real entre sistemas — Alstro y
-- Hijuelas One no comparten base — solo una anotación para ubicar el material
-- físico. Editable desde /planner/lotes; no entra al historial de cambios de
-- planner_lot_plan_changes (ese historial diffea el plan, no metadata).

alter table planner_lots add column if not exists plant_code text;
comment on column planner_lots.plant_code is 'Texto referencial del laboratorio (ej. código de lote de Alstro) — no es un vínculo real, solo anotación para ubicar el material.';
