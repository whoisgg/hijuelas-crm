-- 00064 — plant_index en planner_lots
--
-- El laboratorio (Alstro) usa plantcode E index como dos datos separados
-- (ej. plantcode "AR900" + index "150"). plant_code (migración 00062) ya
-- cubre el primero; este es el segundo, en columna propia porque el usuario
-- espera poder filtrar por índice sin que quede mezclado en un solo texto.
-- Mismo criterio que plant_code: solo referencial, no vínculo real entre
-- sistemas, no entra al historial de cambios del plan.

alter table planner_lots add column if not exists plant_index text;
comment on column planner_lots.plant_index is 'Índice del laboratorio (Alstro), separado de plant_code para poder filtrar por separado — ej. plantcode "AR900" + index "150".';
