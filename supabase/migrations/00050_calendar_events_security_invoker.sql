-- 00050: calendar_events con security_invoker (fix advisor CRITICAL)
--
-- La vista quedó como SECURITY DEFINER (default de Postgres al crearla en
-- las migraciones tempranas): corría con los privilegios del dueño y se
-- saltaba la RLS del usuario consultante — si anon obtenía SELECT sobre la
-- vista, leía contratos sin sesión. Con security_invoker la RLS de las
-- tablas base aplica al usuario real, igual que en todas las vistas nuevas
-- (bodega_*, stock_*). Para el equipo autenticado no cambia nada: la RLS
-- de contracts/clients ya es lectura abierta al equipo.

alter view public.calendar_events set (security_invoker = on);

notify pgrst, 'reload schema';
