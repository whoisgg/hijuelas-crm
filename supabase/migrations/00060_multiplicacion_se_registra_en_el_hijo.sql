-- 00060 — Corrección de la 00059: el evento de multiplicación va sobre el HIJO
--
-- La 00059 dejó `planner_movements.child_lot_id` y la convención de registrar el
-- evento de multiplicación sobre el lote PADRE. Probándolo en un rollback quedó
-- claro que estaba mal: el saldo del padre subía +20.000 plantas por el cutting.
--
-- En un cutting el padre **no gana plantas**: nace un lote nuevo. El usuario lo
-- describió así — "hago cutting y digamos duplico la bandeja sacándola de su
-- ubicación actual y quizá colocándola en una nueva". La bandeja se duplica: la
-- madre conserva la suya y aparece otra.
--
-- Convención correcta: el evento se registra sobre el lote que **GANA** (el hijo)
-- y `source_lot_id` apunta al lote madre. Así el signo positivo del ledger cae
-- donde corresponde y la trazabilidad queda igual de completa.
--
-- Verificado en rollback con el nuevo esquema:
--   padre  2026-24-CER-M14      saldo_eventos = -3.000   (solo su merma)
--   hijo   2026-24-CER-M14-CUT  saldo_eventos = +20.000  (nace)
--   bitácora: multiplicacion sobre el hijo, desde = 2026-24-CER-M14

alter table public.planner_movements rename column child_lot_id to source_lot_id;

comment on column public.planner_movements.source_lot_id is
  'Solo en type=multiplicacion: el lote MADRE del que se corto. El evento se registra sobre el lote que GANA (el hijo), porque el cutting duplica la bandeja: el padre no pierde plantas y el hijo nace.';

alter index if exists planner_movements_child_idx rename to planner_movements_source_idx;

-- La vista tenía el lote hijo en `hacia`; ahora el lote madre va en `desde`, que
-- es lo coherente con que el evento viva en el hijo.
create or replace view public.platform_events
with (security_invoker = on) as
select
  'planner'::text                     as modulo,
  m.type                              as evento,
  'lote'::text                        as entidad_tipo,
  coalesce(l.lot_code, '(sin lote)')  as entidad,
  m.plants::numeric                   as cantidad,
  'plantas'::text                     as unidad,
  m.trays::numeric                    as bandejas,
  coalesce(af.name, src.lot_code)     as desde,
  at.name                             as hacia,
  m.year                              as anio,
  m.week                              as semana,
  m.created_at                        as registrado_en,
  m.created_by                        as actor,
  m.notes                             as nota
from public.planner_movements m
left join public.planner_lots l   on l.id = m.lot_id
left join public.planner_lots src on src.id = m.source_lot_id
left join public.planner_areas af on af.id = m.area_from_id
left join public.planner_areas at on at.id = m.area_to_id

union all
select
  'bodega', 'ingreso', 'producto', i.codigo_producto,
  i.cantidad::numeric, coalesce(p.unidad_medida, 'unidad')::text, null::numeric,
  coalesce(i.proveedor, i.origen), i.bodega,
  extract(year from i.fecha_ingreso)::int,
  nullif(regexp_replace(coalesce(i.numero_semana,''), '\D', '', 'g'), '')::int,
  i.created_at, i.created_by, i.nota
from public.bodega_ingresos i
left join public.bodega_productos p on p.codigo_producto = i.codigo_producto

union all
select
  'bodega', 'salida', 'producto', s.codigo_producto,
  -s.cantidad::numeric, coalesce(s.unidad_salida, p.unidad_medida, 'unidad')::text, null::numeric,
  s.bodega, s.area_destino,
  extract(year from s.fecha_salida)::int,
  nullif(regexp_replace(coalesce(s.numero_semana,''), '\D', '', 'g'), '')::int,
  s.created_at, s.created_by, s.nota
from public.bodega_salidas s
left join public.bodega_productos p on p.codigo_producto = s.codigo_producto

union all
select
  'bodega', 'traspaso', 'producto', t.codigo_producto,
  t.cantidad::numeric, coalesce(p.unidad_medida, 'unidad')::text, null::numeric,
  t.bodega_origen, t.bodega_destino,
  extract(year from t.fecha_traspaso)::int,
  nullif(regexp_replace(coalesce(t.numero_semana,''), '\D', '', 'g'), '')::int,
  t.created_at, t.created_by, t.nota
from public.bodega_traspasos t
left join public.bodega_productos p on p.codigo_producto = t.codigo_producto;

notify pgrst, 'reload schema';
