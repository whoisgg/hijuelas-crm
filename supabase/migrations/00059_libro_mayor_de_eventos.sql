-- 00059 — Libro mayor de eventos del lote (multiplicación y merma) + vista transversal
--
-- El cambio conceptual (ver la nota del vault "Planner - Modelo de Lotes, Origen y
-- Libro Mayor"): hoy `planner_lots.plants` guarda la cantidad como un número fijo,
-- pero el **cutting suma** y la **merma resta**, así que la cantidad de un lote es
-- una función del tiempo. La solución es guardar los hechos y derivar el saldo —
-- el mismo patrón que ya usa Bodega, donde no existe tabla de stock.
--
-- Momento barato para hacerlo: `planner_movements` está VACÍA, no hay nada que
-- migrar. Solo faltaban dos tipos de evento y la referencia al lote hijo.
--
-- La columna `plants` NO se elimina: por ahora conviven "declarado" (el plan) y
-- "derivado" (los eventos), y la vista `planner_lot_ledger` los compara. Cuando
-- se valide con datos reales se puede retirar la columna.

-- ── 1. Dos tipos de evento nuevos ───────────────────────────────────────────
alter table public.planner_movements drop constraint if exists planner_movements_type_check;
alter table public.planner_movements add constraint planner_movements_type_check
  check (type in ('recepcion','traslado','multiplicacion','merma','despacho'));

-- En una multiplicación el evento se registra sobre el lote PADRE (el que se
-- corta) y apunta al lote HIJO que nace. La genealogía además queda en
-- `planner_lots.parent_lot_id` (migración 00058), que es lo que permite subir el
-- árbol sin recorrer los eventos.
alter table public.planner_movements
  add column if not exists child_lot_id integer
    references public.planner_lots(id) on delete set null;

create index if not exists planner_movements_lot_idx on public.planner_movements (lot_id);
create index if not exists planner_movements_child_idx on public.planner_movements (child_lot_id);

comment on column public.planner_movements.child_lot_id is
  'Solo en type=multiplicacion: el lote que nace del cutting.';

-- ── 2. Saldo derivado contra saldo declarado ────────────────────────────────
-- Signo por tipo: recepción y multiplicación suman, merma y despacho restan, y
-- el traslado es neutro (cambia de lugar, no de cantidad).
create or replace view public.planner_lot_ledger
with (security_invoker = on) as
select
  l.id                as lot_id,
  l.lot_code,
  l.origen,
  l.parent_lot_id,
  l.plants            as plantas_declaradas,
  l.trays             as bandejas_declaradas,
  coalesce(sum(
    case m.type
      when 'recepcion'      then  m.plants
      when 'multiplicacion' then  m.plants
      when 'merma'          then -m.plants
      when 'despacho'       then -m.plants
      else 0
    end
  ), 0)               as plantas_por_eventos,
  coalesce(sum(
    case m.type
      when 'recepcion'      then  m.trays
      when 'multiplicacion' then  m.trays
      when 'merma'          then -m.trays
      when 'despacho'       then -m.trays
      else 0
    end
  ), 0)               as bandejas_por_eventos,
  count(m.id)         as eventos,
  coalesce(sum(case when m.type = 'merma'          then m.plants else 0 end), 0) as merma_plantas,
  coalesce(sum(case when m.type = 'multiplicacion' then m.plants else 0 end), 0) as multiplicado_plantas
from public.planner_lots l
left join public.planner_movements m on m.lot_id = l.id
group by l.id, l.lot_code, l.origen, l.parent_lot_id, l.plants, l.trays;

comment on view public.planner_lot_ledger is
  'Saldo declarado (planner_lots.plants, del plan) contra saldo derivado de los eventos. Mientras planner_movements esté vacía, plantas_por_eventos da 0: es esperado, conviven los dos modelos hasta validar.';

-- ── 3. Vista transversal de eventos ─────────────────────────────────────────
-- Decisión de diseño (pregunta del usuario sobre si el libro mayor debía ser
-- transversal a los módulos): los libros de dominio quedan SEPARADOS por módulo
-- —fuertemente tipados, cada uno con sus unidades y validaciones— y lo
-- transversal es esta VISTA que los une normalizados. Así se consigue la
-- trazabilidad cruzada y la bitácora sin duplicar la fuente de verdad ni perder
-- las validaciones de cada dominio. Una tabla de eventos compartida tendría que
-- servir a "200 kg de sustrato entre bodegas" y a "100 bandejas cortadas del
-- lote X", con unidades incompatibles: el anti-patrón de la tabla genérica.
create or replace view public.platform_events
with (security_invoker = on) as
-- Planner: movimientos de lotes
select
  'planner'::text                     as modulo,
  m.type                              as evento,
  'lote'::text                        as entidad_tipo,
  coalesce(l.lot_code, '(sin lote)')  as entidad,
  m.plants::numeric                   as cantidad,
  'plantas'::text                     as unidad,
  m.trays::numeric                    as bandejas,
  af.name                             as desde,
  coalesce(at.name, ch.lot_code)      as hacia,
  m.year                              as anio,
  m.week                              as semana,
  m.created_at                        as registrado_en,
  m.created_by                        as actor,
  m.notes                             as nota
from public.planner_movements m
left join public.planner_lots l  on l.id = m.lot_id
left join public.planner_lots ch on ch.id = m.child_lot_id
left join public.planner_areas af on af.id = m.area_from_id
left join public.planner_areas at on at.id = m.area_to_id

union all
-- Bodega: ingresos de insumos
select
  'bodega', 'ingreso', 'producto', i.codigo_producto,
  i.cantidad::numeric, coalesce(p.unidad_medida, 'unidad')::text, null::numeric,
  coalesce(i.proveedor, i.origen), i.bodega,
  extract(year from i.fecha_ingreso)::int, nullif(regexp_replace(coalesce(i.numero_semana,''), '\D', '', 'g'), '')::int,
  i.created_at, i.created_by, i.nota
from public.bodega_ingresos i
left join public.bodega_productos p on p.codigo_producto = i.codigo_producto

union all
-- Bodega: salidas de insumos
select
  'bodega', 'salida', 'producto', s.codigo_producto,
  -s.cantidad::numeric, coalesce(s.unidad_salida, p.unidad_medida, 'unidad'), null::numeric,
  s.bodega, s.area_destino,
  extract(year from s.fecha_salida)::int, nullif(regexp_replace(coalesce(s.numero_semana,''), '\D', '', 'g'), '')::int,
  s.created_at, s.created_by, s.nota
from public.bodega_salidas s
left join public.bodega_productos p on p.codigo_producto = s.codigo_producto

union all
-- Bodega: traspasos entre bodegas
select
  'bodega', 'traspaso', 'producto', t.codigo_producto,
  t.cantidad::numeric, coalesce(p.unidad_medida, 'unidad'), null::numeric,
  t.bodega_origen, t.bodega_destino,
  extract(year from t.fecha_traspaso)::int, nullif(regexp_replace(coalesce(t.numero_semana,''), '\D', '', 'g'), '')::int,
  t.created_at, t.created_by, t.nota
from public.bodega_traspasos t
left join public.bodega_productos p on p.codigo_producto = t.codigo_producto;

comment on view public.platform_events is
  'Bitácora transversal: une los libros de eventos de Planner y Bodega normalizados a una forma común. NO es fuente de verdad — cada módulo mantiene su propia tabla tipada. Sirve para trazabilidad cruzada, auditoría y la línea de tiempo de una entidad.';

notify pgrst, 'reload schema';
