-- 00056 — Alias de módulo para el inventario de hardening
--
-- El inventario escribe los módulos con otro vocabulario que el archivo viejo de
-- hotelería. Sin estos alias, el importador omitía 431 filas:
--   · "Richel"    → 357 filas  (los alias existentes decían "Richell Zona Clara",
--                               con doble L y nombre completo)
--   · "Richel ZO" →  74 filas
--
-- Se usan con kind='module' (no 'area') a propósito: el resolvedor toma el
-- nombre del módulo canónico de acá, y como "Zona Clara" ES un área, el módulo
-- queda con ese nombre y las ubicaciones (Túnel 1…32) cuelgan del módulo que ya
-- existe, en vez de crear un módulo "Richel" duplicado con 33 ubicaciones nuevas.
--
-- Los demás módulos ya resolvían solos:
--   · "Gótico 1..5" → área Góticos  (se quita el número y aplica el alias "Gótico")
--   · "Túnel TEK"   → área TunelTek (calza por nombre normalizado, sin acentos ni espacios)
--   · "Módulo 1/2"  → áreas homónimas
--   · "Módulo 3" y "HFM" siguen omitidos: falta crear esas áreas (necesitan
--     etapa y capacidad en bandejas, que no vienen en ningún archivo).

-- El CHECK de `planner_uploads.kind` solo aceptaba planner/hoteleria, así que la
-- carga de inventario fallaba al registrarse.
alter table public.planner_uploads drop constraint if exists planner_uploads_kind_check;
alter table public.planner_uploads add constraint planner_uploads_kind_check
  check (kind = any (array['planner','hoteleria','inventario']));

insert into public.planner_aliases (kind, alias, canonical)
select 'module', v.alias, v.canonical
from (values
  ('Richel',    'Zona Clara'),
  ('Richel ZO', 'Zona Oscura'),
  ('Richell',   'Zona Clara')
) as v(alias, canonical)
where not exists (
  select 1 from public.planner_aliases a
  where a.kind = 'module' and lower(a.alias) = lower(v.alias)
);

notify pgrst, 'reload schema';
