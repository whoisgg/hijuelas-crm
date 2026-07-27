-- 00057 — Áreas Módulo 3 y HFM + capacidad por ubicación
--
-- Decisiones del usuario (2026-07-27):
--   · HFM (Hardening Frutales Mayores) → etapa **maduración**, capacidad
--     **provisoria 1.000** bandejas (hoy tiene 64.682 plantas en formato 144, es
--     decir ~450 bandejas ocupadas). Es un área real que **no está delimitada en
--     el KMZ**, así que no se pudo estimar por superficie. Corregir el número
--     desde /planner/ajustes cuando se mida.
--   · Módulo 3 → etapa **predespacho** (como Módulo 1 y 2), capacidad
--     **7.900 estimada**: sale de sus 3.836 m² del KMZ `V.H.Hardening.kmz` por la
--     densidad de los otros módulos (1,93 y 2,17 band/m², consistentes entre sí
--     aunque el resto del vivero varíe de 1,93 a 4,26). Rango 7.400-8.300.
--
-- OJO: crear áreas **agrega columnas a la grilla de Ocupación**. Autorizado
-- explícitamente por el usuario.
--
-- "Hardening" del KMZ NO se crea: es el polígono que CONTIENE Zona Clara y Zona
-- Oscura (verificado con ray-casting), o sea una capa de agrupación del mapa, no
-- un área productiva.

insert into public.planner_areas (name, stage, capacity_trays, type, priority, active)
select v.name, v.stage, v.capacity, v.type, v.priority, true
from (values
  ('Módulo 3', 'predespacho', 7900, 'Predespacho', 3),
  ('HFM',      'maduracion',  1000, 'Maduración',  2)
) as v(name, stage, capacity, type, priority)
where not exists (
  select 1 from public.planner_areas a where lower(a.name) = lower(v.name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- Capacidad por ubicación
--
-- El inventario de hardening no trae capacidad por mesa y el archivo de
-- hotelería solo cubría Góticos / Zona Clara / Zona Oscura, así que las 77
-- ubicaciones nuevas (Módulo 1, Módulo 2, TunelTek) quedaron en null y el plano
-- de sector las dibujaba con capacidad 0.
--
-- Decisión del usuario: usar la capacidad de ÁREA del planner v1.3 —el único
-- dato de capacidad que existe— repartida entre las mesas del área.
-- Es una APROXIMACIÓN uniforme: no todas las mesas son iguales. Se corrige por
-- ubicación cuando haya medición real.
--
-- Solo toca las que están en null: no sobreescribe las capacidades reales que
-- vinieron del archivo de hotelería.
-- ─────────────────────────────────────────────────────────────────────────────
with sin_capacidad as (
  select l.id, m.area_id,
         count(*) over (partition by m.area_id) as mesas_del_area
  from public.planner_locations l
  join public.planner_modules m on m.id = l.module_id
  where l.capacity_trays is null
)
update public.planner_locations l
set capacity_trays = greatest(1, floor(a.capacity_trays::numeric / s.mesas_del_area)::int)
from sin_capacidad s
join public.planner_areas a on a.id = s.area_id
where l.id = s.id
  and a.capacity_trays > 0;

notify pgrst, 'reload schema';
