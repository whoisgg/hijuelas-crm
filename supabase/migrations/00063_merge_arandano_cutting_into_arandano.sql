-- 00063 — Fusiona "Arándano Cutting" en "Arándano"
--
-- "Arándano Cutting" (planner_species id=2) era un bug de import: el origen
-- de propagación (cutting) se modeló como especie separada en vez de
-- atributo por lote (planner_lots.origen, ya poblado 100% desde la
-- migración 00058). Sus 7 variedades eran duplicados exactos de variedades
-- ya existentes bajo "Arándano" (id=1) — 6/7 ya compartían el mismo maestro
-- vinculado. Verificado antes de aplicar: 10 lotes reales, 20 en mesas de
-- trabajo (planner_scenario_lots), 10 en planner_demand — nada en
-- planner_inventory_items ni planner_occupancy_snapshot.
--
-- Mapeo cutting_variety_id -> arandano_variety_id (1:1 por nombre):
--  53 A20-06-03 -> 4 | 54 Emerald -> 9 | 55 Eureka Dawn -> 10 | 56 Eureka Sunrise -> 13
--  57 Eureka Sunset -> 38 | 58 Legacy -> 20 | 59 Masena -> 23
--
-- El par 56/13 (Eureka Sunrise / Eureka sunrise) era además un duplicado en
-- el maestro compartido del CRM (varieties): dos filas iguales salvo
-- mayúscula. Verificado con contract_items.variety_id: la fila minúscula
-- (606d2a48-1b7c-49e3-9864-a7909cde1bd5) tiene 25 contratos reales; la
-- mayúscula (c5a8ca97-b168-4d0f-975f-e345b6519d95) tiene cero referencias en
-- todo el sistema (contract_items/opportunity_items/calendar_events/
-- planner_varieties) — huérfana, segura de dar de baja.

with mapping(cutting_id, ara_id) as (
  values (53,4), (54,9), (55,10), (56,13), (57,38), (58,20), (59,23)
)
update planner_lots l
set species_id = 1, variety_id = m.ara_id
from mapping m
where l.variety_id = m.cutting_id and l.species_id = 2;

with mapping(cutting_id, ara_id) as (
  values (53,4), (54,9), (55,10), (56,13), (57,38), (58,20), (59,23)
)
update planner_scenario_lots l
set species_id = 1, variety_id = m.ara_id
from mapping m
where l.variety_id = m.cutting_id and l.species_id = 2;

with mapping(cutting_id, ara_id) as (
  values (53,4), (54,9), (55,10), (56,13), (57,38), (58,20), (59,23)
)
update planner_demand d
set species_id = 1, variety_id = m.ara_id
from mapping m
where d.variety_id = m.cutting_id and d.species_id = 2;

-- Vincula la variedad superviviente "Eureka sunrise" (planner id=13, bajo
-- Arándano) al maestro real del CRM (25 contratos reales la usan).
update planner_varieties
set master_variety_id = '606d2a48-1b7c-49e3-9864-a7909cde1bd5'
where id = 13 and master_variety_id is null;

-- Borra el maestro duplicado huérfano "Eureka Sunrise".
update varieties
set deleted_at = now()
where id = 'c5a8ca97-b168-4d0f-975f-e345b6519d95';

-- Las 7 variedades y la especie "Arándano Cutting" quedan sin ningún lote,
-- demanda o mesa de trabajo apuntándolas: se eliminan (sin deleted_at en
-- estas tablas del planner, a diferencia de los maestros del CRM).
delete from planner_varieties where id in (53,54,55,56,57,58,59);
delete from planner_species where id = 2;
