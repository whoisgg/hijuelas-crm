-- 00055 — Detalle de inventario de hardening + alias de ubicación
--
-- El archivo "Inventario Hrd 2026" es mucho más rico que el de hotelería que
-- venía alimentando el snapshot: trae una fila por barcode con delivery note,
-- variedad, medio de cultivo, formato del material y FECHA DE PLANTACIÓN.
--
-- Decisión de modelo: NO se ensancha `planner_occupancy_snapshot` (que es
-- ubicación × especie y hoy alimenta Ocupación y el plano de sector sin
-- problemas). Se agrega una tabla de DETALLE aparte y el snapshot se sigue
-- escribiendo agregado desde ella. Así nada de lo que ya funciona cambia, y
-- queda el grano fino para la vista de antigüedad y la trazabilidad al lab.
--
-- Ojo con la antigüedad: la fecha de plantación describe lo que está FÍSICAMENTE
-- en la mesa, así que vive acá (lo real) y no en `planner_lots` (que es el plan).
-- La antigüedad se calcula desde esta tabla.

create table if not exists public.planner_inventory_items (
  id            bigserial primary key,
  upload_id     uuid not null references public.planner_uploads(id) on delete cascade,
  location_id   integer references public.planner_locations(id) on delete set null,

  -- trazabilidad al laboratorio
  delivery_note text,
  barcode       text,

  -- qué es
  species_id    integer references public.planner_species(id) on delete set null,
  species_name  text,
  variety_id    integer references public.planner_varieties(id) on delete set null,
  variety_name  text,

  -- material: `Tipo Material` descompuesto (ver nota de diseño en el vault)
  medio         text check (medio in ('TC','RT','MP')),
  tamano        text check (tamano in ('Grande','Chico')),
  clump         boolean not null default false,
  sustrato      boolean not null default false,
  estado        text check (estado in ('PRE','TRASPLANTE')),
  material_raw  text,

  -- cantidades. plants = trays * tray_format + saldos (verificado en 1.236/1.236 filas)
  trays         integer not null default 0,
  saldos        integer not null default 0,
  plants        integer not null default 0,
  tray_format   integer,

  -- antigüedad
  planted_at    date,
  week          integer,
  age_weeks     integer,

  observacion   text,
  created_at    timestamptz not null default now()
);

create index if not exists planner_inventory_items_upload_idx
  on public.planner_inventory_items (upload_id);
create index if not exists planner_inventory_items_location_idx
  on public.planner_inventory_items (location_id);
create index if not exists planner_inventory_items_planted_idx
  on public.planner_inventory_items (planted_at);

alter table public.planner_inventory_items enable row level security;

-- Misma política que el resto del planner: lectura para el equipo autenticado,
-- escritura solo por el importador (que corre con la sesión del usuario y ya
-- valida `module_access` en la server action).
drop policy if exists planner_inventory_items_read on public.planner_inventory_items;
create policy planner_inventory_items_read
  on public.planner_inventory_items for select
  using (auth.uid() is not null);

drop policy if exists planner_inventory_items_write on public.planner_inventory_items;
create policy planner_inventory_items_write
  on public.planner_inventory_items for all
  using (auth.uid() is not null)
  with check (auth.uid() is not null);

-- ─────────────────────────────────────────────────────────────────────────────
-- Alias de ubicación: el inventario escribe "RACK 1..4" y la BD tiene
-- "RACK ZO 1..4" (vienen del archivo de hotelería). Sin esto el importador
-- crearía 4 ubicaciones duplicadas en Zona Oscura.
-- Se usa la tabla `planner_aliases` que ya existe, pero su CHECK solo aceptaba
-- area/module/species/variety, así que hay que ampliarlo.
-- ─────────────────────────────────────────────────────────────────────────────
alter table public.planner_aliases drop constraint if exists planner_aliases_kind_check;
alter table public.planner_aliases add constraint planner_aliases_kind_check
  check (kind = any (array['area','module','species','variety','location']));

insert into public.planner_aliases (kind, alias, canonical)
select 'location', v.alias, v.canonical
from (values
  ('RACK 1', 'RACK ZO 1'),
  ('RACK 2', 'RACK ZO 2'),
  ('RACK 3', 'RACK ZO 3'),
  ('RACK 4', 'RACK ZO 4')
) as v(alias, canonical)
where not exists (
  select 1 from public.planner_aliases a
  where a.kind = 'location' and lower(a.alias) = lower(v.alias)
);

notify pgrst, 'reload schema';
