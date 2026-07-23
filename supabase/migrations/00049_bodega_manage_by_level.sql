-- 00049: _bodega_can_manage sigue la semántica de niveles de la plataforma
--
-- Gestionar movimientos/productos depende del NIVEL (editor o admin del
-- módulo), no del rol propio: un solicitante se asigna con nivel viewer
-- (solo lectura + crear solicitudes); gerente/almacenista van con nivel
-- editor. El module_role queda como función/scoping, igual que en CRM.

create or replace function public._bodega_can_manage()
returns boolean
language sql
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public._bodega_access() a
    where a.level in ('admin', 'editor')
  );
$$;

notify pgrst, 'reload schema';
