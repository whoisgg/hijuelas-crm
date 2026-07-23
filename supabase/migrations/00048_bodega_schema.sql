-- 00048: Módulo Bodega e Insumos — schema completo (port de Ventory)
--
-- Replica el modelo de Ventory (github.com/Ghost0192/Ventory) dentro de la
-- plataforma Hijuelas One: productos, ingresos, salidas, traspasos entre
-- bodegas, solicitudes (carrito con workflow) y catálogos, con vistas de
-- stock calculado. Nombres de dominio en español (igual que Ventory) para
-- facilitar la migración de datos en fase 4.
--
-- Permisos: via module_access (module_key='bodega'):
--   nivel admin  → administra catálogos y todo el módulo
--   module_role  → gerente / almacenista (operan movimientos y productos),
--                  solicitante (crea solicitudes)
--   platform admin / role legacy 'admin' → todo.
-- El scoping fino por sucursal/bodega del usuario queda para fase 2
-- (module_access.settings). Fase 1 gatea por rol del módulo.

-- 1. Acceso del caller al módulo bodega ------------------------------------

create or replace function public._bodega_access()
returns table (level text, module_role text)
language sql
security definer
set search_path = public, pg_temp
as $$
  select
    case
      when exists (
        select 1 from app_users
        where id = auth.uid()
          and (role = 'admin' or is_platform_admin)
          and is_active and deleted_at is null
      ) then 'admin'
      else ma.level::text
    end as level,
    ma.module_role
  from app_users u
  left join module_access ma
    on ma.user_id = u.id and ma.module_key = 'bodega'
  where u.id = auth.uid()
    and u.is_active and u.deleted_at is null
  limit 1;
$$;

-- ¿Puede operar movimientos/productos? (admin del módulo, gerente o almacenista)
create or replace function public._bodega_can_manage()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public._bodega_access() a
    where a.level = 'admin'
       or a.module_role in ('gerente', 'almacenista')
  );
$$;

-- ¿Tiene acceso al módulo (cualquier nivel)?
create or replace function public._bodega_can_read()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public._bodega_access() a where a.level is not null
  );
$$;

-- 2. Catálogos --------------------------------------------------------------

create table public.bodega_bodegas (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(100) unique not null,
  sucursal varchar(100),
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.bodega_unidades (
  id uuid primary key default gen_random_uuid(),
  nombre varchar(50) unique not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.bodega_bodegas (nombre, sucursal) values
  ('BODEGA PRINCIPAL', 'HIJUELAS'),
  ('BODEGA SECUNDARIA', 'HIJUELAS'),
  ('BODEGA TRANSFERENCIA', 'HIJUELAS');

insert into public.bodega_unidades (nombre) values
  ('UNIDAD'), ('KG'), ('LITRO'), ('METRO'), ('CAJA'), ('BOLSA'),
  ('TAMBOR'), ('TANQUE'), ('GENERAL');

-- 3. Productos ---------------------------------------------------------------

create table public.bodega_productos (
  id uuid primary key default gen_random_uuid(),
  codigo_producto varchar(50) unique not null default '',
  nombre_prod varchar(255) not null,
  descripcion text,
  categoria varchar(100),
  unidad_medida varchar(50),
  stock_minimo numeric(12,2) not null default 0,
  tipo_inventario varchar(100),
  cuenta_contable varchar(50),
  ranking_notas varchar(100),
  activo boolean not null default true,
  created_by uuid references public.app_users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_bodega_productos_categoria on public.bodega_productos (categoria);
create index idx_bodega_productos_activo on public.bodega_productos (activo);

-- Código GHPROD-000001 (mismo formato que Ventory, para importar data luego)
create sequence public.seq_bodega_codigo_producto start 1;

create or replace function public.bodega_asignar_codigo_producto()
returns trigger
language plpgsql
as $$
begin
  new.codigo_producto := 'GHPROD-' || lpad(nextval('public.seq_bodega_codigo_producto')::text, 6, '0');
  return new;
end;
$$;

create trigger trg_bodega_codigo_producto
before insert on public.bodega_productos
for each row
when (new.codigo_producto is null or new.codigo_producto = '')
execute function public.bodega_asignar_codigo_producto();

-- 4. Ingresos ----------------------------------------------------------------

create table public.bodega_ingresos (
  id uuid primary key default gen_random_uuid(),
  codigo_ingreso varchar(50) unique not null default '',
  codigo_producto varchar(50) not null references public.bodega_productos (codigo_producto),
  cantidad numeric(12,2) not null check (cantidad > 0),
  precio_unitario numeric(12,2),
  proveedor varchar(255),
  origen varchar(100),
  fecha_ingreso date not null default current_date,
  numero_documento varchar(100),
  numero_semana varchar(10),
  sucursal varchar(100),
  bodega varchar(100),
  nota text,
  created_by uuid references public.app_users (id),
  created_at timestamptz not null default now()
);

create index idx_bodega_ingresos_producto on public.bodega_ingresos (codigo_producto);
create index idx_bodega_ingresos_fecha on public.bodega_ingresos (fecha_ingreso);
create index idx_bodega_ingresos_bodega on public.bodega_ingresos (bodega);

create sequence public.seq_bodega_codigo_ingreso start 1;

create or replace function public.bodega_asignar_codigo_ingreso()
returns trigger
language plpgsql
as $$
begin
  new.codigo_ingreso := 'ING-' || lpad(nextval('public.seq_bodega_codigo_ingreso')::text, 6, '0');
  return new;
end;
$$;

create trigger trg_bodega_codigo_ingreso
before insert on public.bodega_ingresos
for each row
when (new.codigo_ingreso is null or new.codigo_ingreso = '')
execute function public.bodega_asignar_codigo_ingreso();

-- 5. Salidas -----------------------------------------------------------------

create table public.bodega_salidas (
  id uuid primary key default gen_random_uuid(),
  codigo_producto varchar(50) not null references public.bodega_productos (codigo_producto),
  cantidad numeric(12,2) not null check (cantidad > 0),
  area_destino varchar(100),
  fecha_salida date not null default current_date,
  numero_documento varchar(100),
  numero_semana varchar(10),
  unidad_salida varchar(50),
  sucursal varchar(100),
  bodega varchar(100),
  nota text,
  created_by uuid references public.app_users (id),
  created_at timestamptz not null default now()
);

create index idx_bodega_salidas_producto on public.bodega_salidas (codigo_producto);
create index idx_bodega_salidas_fecha on public.bodega_salidas (fecha_salida);
create index idx_bodega_salidas_bodega on public.bodega_salidas (bodega);

-- 6. Traspasos entre bodegas -------------------------------------------------

create table public.bodega_traspasos (
  id uuid primary key default gen_random_uuid(),
  codigo_traspaso varchar(50) unique not null default '',
  codigo_producto varchar(50) not null references public.bodega_productos (codigo_producto),
  cantidad numeric(12,2) not null check (cantidad > 0),
  bodega_origen varchar(100) not null,
  bodega_destino varchar(100) not null check (bodega_destino <> bodega_origen),
  sucursal_origen varchar(100),
  sucursal_destino varchar(100),
  fecha_traspaso date not null default current_date,
  numero_semana varchar(10),
  nota text,
  created_by uuid references public.app_users (id),
  created_at timestamptz not null default now()
);

create index idx_bodega_traspasos_bodegas on public.bodega_traspasos (bodega_origen, bodega_destino);

create sequence public.seq_bodega_codigo_traspaso start 1;

create or replace function public.bodega_asignar_codigo_traspaso()
returns trigger
language plpgsql
as $$
begin
  new.codigo_traspaso := 'TRA-' || lpad(nextval('public.seq_bodega_codigo_traspaso')::text, 6, '0');
  return new;
end;
$$;

create trigger trg_bodega_codigo_traspaso
before insert on public.bodega_traspasos
for each row
when (new.codigo_traspaso is null or new.codigo_traspaso = '')
execute function public.bodega_asignar_codigo_traspaso();

-- 7. Solicitudes (carrito con workflow) ---------------------------------------

create table public.bodega_solicitudes (
  id uuid primary key default gen_random_uuid(),
  codigo_solicitud varchar(12) unique not null default '',
  solicitante_id uuid not null references public.app_users (id),
  area varchar(100),
  sucursal varchar(100),
  bodega varchar(100),
  estado varchar(20) not null default 'PENDIENTE'
    check (estado in ('PENDIENTE','EN PREPARACION','PARCIAL','DESPACHADA','CERRADA','RECHAZADA','CANCELADA')),
  nota text,
  motivo_rechazo text,
  fecha_solicitud date not null default current_date,
  numero_semana varchar(10),
  tomado_por uuid references public.app_users (id),
  fecha_preparacion timestamptz,
  despachado_por uuid references public.app_users (id),
  fecha_despacho timestamptz,
  cerrado_por uuid references public.app_users (id),
  fecha_cierre timestamptz,
  created_at timestamptz not null default now()
);

create table public.bodega_solicitud_items (
  id uuid primary key default gen_random_uuid(),
  solicitud_id uuid not null references public.bodega_solicitudes (id) on delete cascade,
  codigo_producto varchar(50) not null references public.bodega_productos (codigo_producto),
  cantidad numeric(12,2) not null check (cantidad > 0),
  cantidad_despachada numeric(12,2),
  unidad varchar(50),
  nota text
);

create index idx_bodega_solicitudes_solicitante on public.bodega_solicitudes (solicitante_id);
create index idx_bodega_solicitudes_scope on public.bodega_solicitudes (sucursal, bodega, estado);
create index idx_bodega_solicitud_items_solicitud on public.bodega_solicitud_items (solicitud_id);

create sequence public.seq_bodega_codigo_solicitud start 1;

create or replace function public.bodega_asignar_codigo_solicitud()
returns trigger
language plpgsql
as $$
begin
  new.codigo_solicitud := 'SOL-' || lpad(nextval('public.seq_bodega_codigo_solicitud')::text, 6, '0');
  return new;
end;
$$;

create trigger trg_bodega_codigo_solicitud
before insert on public.bodega_solicitudes
for each row
when (new.codigo_solicitud is null or new.codigo_solicitud = '')
execute function public.bodega_asignar_codigo_solicitud();

-- 8. Vistas de stock ----------------------------------------------------------
-- estado_stock: 'urgente' (bajo el mínimo) | 'bajo' (hasta 110% del mínimo)
-- | 'suficiente'. La UI mapea a badges.

create or replace view public.bodega_stock_disponible
with (security_invoker = on) as
select
  p.id,
  p.codigo_producto,
  p.nombre_prod,
  p.descripcion,
  p.categoria,
  p.tipo_inventario,
  p.unidad_medida,
  p.stock_minimo,
  p.activo,
  coalesce(i.total_ingresos, 0::numeric) as total_ingresos,
  coalesce(s.total_salidas, 0::numeric) as total_salidas,
  coalesce(i.total_ingresos, 0::numeric) - coalesce(s.total_salidas, 0::numeric) as stock_disponible,
  case
    when p.stock_minimo = 0 then null::numeric
    else round(
      (coalesce(i.total_ingresos, 0::numeric) - coalesce(s.total_salidas, 0::numeric))
      / nullif(p.stock_minimo, 0)::numeric * 100.0, 2)
  end as porcentaje_stock_min,
  case
    when (coalesce(i.total_ingresos, 0::numeric) - coalesce(s.total_salidas, 0::numeric)) < p.stock_minimo::numeric
      then 'urgente'
    when (coalesce(i.total_ingresos, 0::numeric) - coalesce(s.total_salidas, 0::numeric)) <= (p.stock_minimo::numeric * 1.10)
      then 'bajo'
    else 'suficiente'
  end as estado_stock
from public.bodega_productos p
left join (
  select codigo_producto, sum(cantidad) as total_ingresos
  from public.bodega_ingresos group by codigo_producto
) i on i.codigo_producto = p.codigo_producto
left join (
  select codigo_producto, sum(cantidad) as total_salidas
  from public.bodega_salidas group by codigo_producto
) s on s.codigo_producto = p.codigo_producto
where p.activo = true
order by p.nombre_prod;

create or replace view public.bodega_stock_por_bodega
with (security_invoker = on) as
with mov as (
  select codigo_producto, bodega, cantidad as ingreso, 0::numeric as salida
  from public.bodega_ingresos where bodega is not null
  union all
  select codigo_producto, bodega, 0::numeric, cantidad
  from public.bodega_salidas where bodega is not null
),
agg as (
  select codigo_producto, bodega,
    sum(ingreso) as total_ingresos, sum(salida) as total_salidas
  from mov group by codigo_producto, bodega
)
select
  p.id,
  p.codigo_producto,
  p.nombre_prod,
  p.descripcion,
  p.categoria,
  p.tipo_inventario,
  p.unidad_medida,
  p.stock_minimo,
  p.activo,
  a.bodega,
  b.sucursal,
  coalesce(a.total_ingresos, 0::numeric) as total_ingresos,
  coalesce(a.total_salidas, 0::numeric) as total_salidas,
  coalesce(a.total_ingresos, 0::numeric) - coalesce(a.total_salidas, 0::numeric) as stock_disponible,
  case
    when (coalesce(a.total_ingresos, 0::numeric) - coalesce(a.total_salidas, 0::numeric)) < p.stock_minimo::numeric
      then 'urgente'
    when (coalesce(a.total_ingresos, 0::numeric) - coalesce(a.total_salidas, 0::numeric)) <= (p.stock_minimo::numeric * 1.10)
      then 'bajo'
    else 'suficiente'
  end as estado_stock
from agg a
join public.bodega_productos p on p.codigo_producto = a.codigo_producto
left join public.bodega_bodegas b on b.nombre = a.bodega
where p.activo = true
order by p.nombre_prod, a.bodega;

-- 9. RPC traspaso atómico (valida stock del origen dentro de la transacción) --

create or replace function public.bodega_registrar_traspaso(
  p_codigo_producto text,
  p_cantidad numeric,
  p_bodega_origen text,
  p_bodega_destino text,
  p_sucursal_origen text,
  p_sucursal_destino text,
  p_fecha date,
  p_semana text,
  p_unidad text,
  p_nota text
) returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_codigo text;
  v_stock numeric;
begin
  select coalesce(sum(cantidad), 0) into v_stock
  from bodega_ingresos
  where codigo_producto = p_codigo_producto and bodega = p_bodega_origen;

  select v_stock - coalesce(sum(cantidad), 0) into v_stock
  from bodega_salidas
  where codigo_producto = p_codigo_producto and bodega = p_bodega_origen;

  if v_stock < p_cantidad then
    raise exception 'Stock insuficiente en %: disponible %', p_bodega_origen, v_stock;
  end if;

  insert into bodega_traspasos (
    codigo_producto, cantidad, bodega_origen, bodega_destino,
    sucursal_origen, sucursal_destino, fecha_traspaso, numero_semana, nota, created_by
  ) values (
    p_codigo_producto, p_cantidad, p_bodega_origen, p_bodega_destino,
    p_sucursal_origen, p_sucursal_destino, p_fecha, p_semana, p_nota, auth.uid()
  )
  returning codigo_traspaso into v_codigo;

  insert into bodega_salidas (
    codigo_producto, cantidad, area_destino, numero_documento, nota,
    fecha_salida, unidad_salida, numero_semana, sucursal, bodega, created_by
  ) values (
    p_codigo_producto, p_cantidad, 'TRASPASO', v_codigo,
    'Traspaso ' || v_codigo || ' hacia ' || p_bodega_destino,
    p_fecha, p_unidad, p_semana, p_sucursal_origen, p_bodega_origen, auth.uid()
  );

  insert into bodega_ingresos (
    codigo_producto, cantidad, proveedor, origen, nota,
    fecha_ingreso, numero_semana, sucursal, bodega, created_by
  ) values (
    p_codigo_producto, p_cantidad, 'TRASPASO INTERNO', 'TRASPASO',
    'Traspaso ' || v_codigo || ' desde ' || p_bodega_origen,
    p_fecha, p_semana, p_sucursal_destino, p_bodega_destino, auth.uid()
  );

  return v_codigo;
end;
$$;

grant execute on function public.bodega_registrar_traspaso(text, numeric, text, text, text, text, date, text, text, text) to authenticated;

-- 10. RLS ---------------------------------------------------------------------
-- Lectura: cualquier usuario con acceso al módulo. Escritura de movimientos
-- y productos: gestores (admin del módulo / gerente / almacenista).
-- Catálogos: solo admin del módulo. Solicitudes: cualquier usuario del módulo
-- crea; gestores actualizan.

alter table public.bodega_bodegas enable row level security;
alter table public.bodega_unidades enable row level security;
alter table public.bodega_productos enable row level security;
alter table public.bodega_ingresos enable row level security;
alter table public.bodega_salidas enable row level security;
alter table public.bodega_traspasos enable row level security;
alter table public.bodega_solicitudes enable row level security;
alter table public.bodega_solicitud_items enable row level security;

create policy bodega_bodegas_select on public.bodega_bodegas
  for select to authenticated using (public._bodega_can_read());
create policy bodega_bodegas_write on public.bodega_bodegas
  for all to authenticated
  using ((select level from public._bodega_access()) = 'admin')
  with check ((select level from public._bodega_access()) = 'admin');

create policy bodega_unidades_select on public.bodega_unidades
  for select to authenticated using (public._bodega_can_read());
create policy bodega_unidades_write on public.bodega_unidades
  for all to authenticated
  using ((select level from public._bodega_access()) = 'admin')
  with check ((select level from public._bodega_access()) = 'admin');

create policy bodega_productos_select on public.bodega_productos
  for select to authenticated using (public._bodega_can_read());
create policy bodega_productos_insert on public.bodega_productos
  for insert to authenticated with check (public._bodega_can_manage());
create policy bodega_productos_update on public.bodega_productos
  for update to authenticated
  using (public._bodega_can_manage())
  with check (public._bodega_can_manage());

create policy bodega_ingresos_select on public.bodega_ingresos
  for select to authenticated using (public._bodega_can_read());
create policy bodega_ingresos_insert on public.bodega_ingresos
  for insert to authenticated with check (public._bodega_can_manage());
create policy bodega_ingresos_update on public.bodega_ingresos
  for update to authenticated
  using (public._bodega_can_manage())
  with check (public._bodega_can_manage());

create policy bodega_salidas_select on public.bodega_salidas
  for select to authenticated using (public._bodega_can_read());
create policy bodega_salidas_insert on public.bodega_salidas
  for insert to authenticated with check (public._bodega_can_manage());
create policy bodega_salidas_update on public.bodega_salidas
  for update to authenticated
  using (public._bodega_can_manage())
  with check (public._bodega_can_manage());

create policy bodega_traspasos_select on public.bodega_traspasos
  for select to authenticated using (public._bodega_can_read());
create policy bodega_traspasos_insert on public.bodega_traspasos
  for insert to authenticated with check (public._bodega_can_manage());

create policy bodega_solicitudes_select on public.bodega_solicitudes
  for select to authenticated using (public._bodega_can_read());
create policy bodega_solicitudes_insert on public.bodega_solicitudes
  for insert to authenticated
  with check (public._bodega_can_read() and solicitante_id = auth.uid());
create policy bodega_solicitudes_update on public.bodega_solicitudes
  for update to authenticated
  using (public._bodega_can_manage() or solicitante_id = auth.uid())
  with check (public._bodega_can_manage() or solicitante_id = auth.uid());

create policy bodega_solicitud_items_select on public.bodega_solicitud_items
  for select to authenticated using (public._bodega_can_read());
create policy bodega_solicitud_items_insert on public.bodega_solicitud_items
  for insert to authenticated
  with check (
    exists (
      select 1 from public.bodega_solicitudes s
      where s.id = solicitud_id
        and (public._bodega_can_manage() or s.solicitante_id = auth.uid())
    )
  );
create policy bodega_solicitud_items_update on public.bodega_solicitud_items
  for update to authenticated
  using (public._bodega_can_manage())
  with check (public._bodega_can_manage());

-- 11. Recargar schema PostgREST ----------------------------------------------

notify pgrst, 'reload schema';
