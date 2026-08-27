-- ============================================================================
-- STAGING / CARGA: Campaña Perú 2026-2027  (FLUJO DE INGRESOS POR COBRAR)
-- ----------------------------------------------------------------------------
-- Fuente : imágenes "FLUJO DE INGRESOS POR COBRAR 2026-2027 | Detalle
--          Productores" entregadas por el usuario (29 líneas de detalle).
-- Motivo : el CRM tenía cargada la BBDD vieja (2024/2025). Faltaba casi toda
--          la campaña 2026-27 de Perú (2027 estaba en CERO).
-- Genera : 29 contratos (1 por línea del Excel) + 6 clientes nuevos +
--          3 variedades nuevas (Andrea, NS16-8, NS15-13) + 59 pagos
--          (38 del Excel 60%/40% + 21 saldos 40% pendientes calculados, sección D2).
--          "Mágica" y "Agricola Cerro Prieto S.A." (=ACP) ya existen.
--
-- !!! NO ES UNA MIGRACIÓN AUTO-APLICABLE. Vive en supabase/staging/ a propósito
--     para que el runner de migraciones NO la ejecute sola.
--
-- CÓMO USAR:
--   1. Ejecutar tal cual -> termina en ROLLBACK = "dry run". Valida que todo
--      inserta sin errores PERO no persiste nada.
--   2. Revisar el SELECT de verificación final.
--   3. Cuando estés conforme, cambiar el  ROLLBACK;  del final por  COMMIT;
--
-- SUPUESTOS (revisar antes de COMMIT):
--   A. Especie = Arándano para todas las líneas.
--   B. Variedad por DEFECTO = "Mágica" (id af29a56b-c0c2-4121-b789-3b71b7ac8d1f).
--      El paréntesis del Excel marca la EXCEPCIÓN: (Andrea)/(NS16-8)/(NS15-13).
--   C. delivery_week = primera semana ISO aprox. del mes (Excel solo trae mes).
--   D. Org vendedora = "Inversiones San Juan de la Luz" (56/67 contratos PE).
--   E. condition='venta', sale_type='exportacion', currency='USD', precio del Excel.
--   F. status='firmado' (tienen factura/anticipo cobrado). Agroextiende=cancelado.
--   G. "ACP" = Agrícola Cerro Prieto S.A. (cliente EXISTENTE, id 6f25f8ae...).
--      Las 3 líneas ACP se mapean a ese cliente, NO se crea uno nuevo.
--      OJO: ese cliente comparte RUT 20461642706 con Excellence Fruit -> limpiar aparte.
--   H. PAGOS: se cargan en la tabla `payments` (sección D). 60% adelanto =
--      'anticipo_1'; 40% = 'saldo'. Columna "cobrado" del Excel -> status
--      'pagado' (con su fecha); "por cobrar" -> status 'pendiente'.
--      Montos parciales (ej. Huarmey) se cargan como 2 pagos del mismo tipo.
--      Agroextiende (anulado) no lleva pagos.
-- ============================================================================

BEGIN;

-- ---- Constantes -----------------------------------------------------------
-- country PE      : a06525cc-7a40-46d6-b1cb-7b5e3b250c9c
-- org SJL         : 1b99b1fe-1349-4397-88dd-e2686e36cf91
-- especie Arándano: cacc1af5-fccc-438e-9985-ac2b74ec36b4
-- variedad Mágica : af29a56b-c0c2-4121-b789-3b71b7ac8d1f

-- ---- A. Variedades nuevas (idempotente por nombre) ------------------------
-- Solo las del paréntesis. "Mágica" ya existe en el catálogo (ya es OZ).
-- Toda la campaña Perú es del programa OZ (f4999ec9-...).
INSERT INTO varieties (name, species_id, genetic_program_id, is_active)
SELECT v.name, 'cacc1af5-fccc-438e-9985-ac2b74ec36b4', 'f4999ec9-1e16-4bcc-bc82-3c4c8181b3dc', true
FROM (VALUES ('Andrea'), ('NS16-8'), ('NS15-13')) AS v(name)
WHERE NOT EXISTS (SELECT 1 FROM varieties x WHERE x.name = v.name);

-- ---- B. Clientes nuevos (idempotente por nombre) --------------------------
-- account_owner_id queda NULL (asignar KAM luego). Jorge Vidal maneja la
-- mayoría de PE: 326adb2f-d65e-4e41-a225-1edecf2c5207 (descomentar si aplica).
INSERT INTO clients (name, country_id, source, is_active, notes)
SELECT v.name, 'a06525cc-7a40-46d6-b1cb-7b5e3b250c9c', 'carga_peru_2026_2027', true, v.note
FROM (VALUES
  ('Atitlan Berries SAC', 'Campaña 2026-27. Falta RUT.'),
  ('Agricola Drokasa',    'Campaña 2026-27. Falta RUT.'),
  ('Agrofutura',          'Campaña 2026-27. Falta RUT.'),
  ('Puraberries',         'Campaña 2026-27. Falta RUT.'),
  ('Alteña',              'Campaña 2026-27. Falta RUT.'),
  ('Hass Peru',           'Campaña 2026-27. Falta RUT.')
) AS v(name, note)
WHERE NOT EXISTS (
  SELECT 1 FROM clients c
  WHERE lower(c.name) = lower(v.name)
    AND c.country_id = 'a06525cc-7a40-46d6-b1cb-7b5e3b250c9c'
);

-- ---- C. Carga de contratos + items ----------------------------------------
-- 29 líneas. client_match -> client_id ; variety_match -> variety_id (por nombre).
WITH stage(num, client_match, variety_match, qty, price, dyear, dmonth, dweek, status, traza) AS (
  VALUES
  -- Clientes EXISTENTES
  ('SJL-2026-PC01','Complejo Agroindustrial Beta S.A.', 'Mágica',  32000, 3.50, 2026, 2,  6,'firmado','F60:F001-528 pag 31/12/2025; F40:F001-700 pag 29/01/2026; ant60 cobrado 67.200; 40% 44.800'),
  ('SJL-2026-PC02','Complejo Agroindustrial Beta S.A.', 'Mágica',  38885, 3.50, 2026, 3, 10,'firmado','F60:F001-529 pag 31/12/2025; F40:F001-701 pag 17/04/2026; ant60 81.658,50; 40% 54.439'),
  ('SJL-2026-PC03','Complejo Agroindustrial Beta S.A.', 'Mágica', 555500, 3.50, 2026,10, 40,'firmado','F60:F001-527 pag 31/12/2025; ant60 1.166.550'),
  ('SJL-2026-PC04','Complejo Agroindustrial Beta S.A.', 'Mágica', 555500, 4.20, 2027, 3, 10,'firmado','F60:F001-530 pag 31/12/2025; ant60 1.399.860; ADELANTO POR COBRAR 233.310; PRECIO 4.20'),
  ('SJL-2026-PC05','Bomarea SRL (Unifrutti Latam Investments SPV RSC Limited)', 'Mágica', 928000, 3.50, 2026,10, 40,'firmado','F60:F001-624 pag 18/04/2025; ant60 1.948.800'),
  ('SJL-2026-PC06','Agroextiende Perú SAC BIC',         'Mágica',      0, 3.50, 2026,11, 45,'cancelado','ANULADO en Excel. F001-742 pag 05/03/2026; adelanto 60% COBRADO 200.000 (posible devolución). << revisar contrato 630k 2026 ya en CRM >>'),
  ('SJL-2026-PC07','Procesos Agroindustriales SA',      'Mágica', 290000, 3.50, 2026,11, 45,'firmado','F60:F001-408 pag 17/11/2025; ant60 609.000'),
  ('SJL-2026-PC08','Procesos Agroindustriales SA',      'Mágica',   2320, 3.50, 2026,11, 45,'firmado','F:F001-776 pag 21/02/2026; ant60 4.872; 40% cobrado 3.248'),
  ('SJL-2026-PC09','Agrocasagrande SAC (Grupo Gloria)', 'Mágica', 180000, 3.50, 2026,10, 40,'firmado','F60:F001-666 pag 09/03/2026; ant60 378.000'),
  ('SJL-2026-PC10','Agrocasagrande SAC (Grupo Gloria)', 'Mágica',    840, 3.50, 2026,11, 45,'firmado','F:F001-716 pag 23/02/2026; ant60 1.764; 40% cobrado 1.176'),
  ('SJL-2026-PC11','Diamond Bridge SAC',                'Mágica', 695000, 3.50, 2026,11, 45,'firmado','F60:F001-768 pag 03/03/2026; ant60 1.459.500'),
  ('SJL-2026-PC12','Sol y Pampa SAC',                   'Mágica', 121200, 3.50, 2026,11, 45,'firmado','sin factura; ADELANTO POR COBRAR 254.520'),
  ('SJL-2026-PC13','Morava SAC',                        'Mágica', 234800, 3.50, 2026,11, 45,'firmado','F60:F001-948; ant60 493.080'),
  ('SJL-2026-PC14','Morava SAC',                        'Andrea',  26000, 3.50, 2026,11, 45,'firmado','F60:F001-947; ant60 54.600'),
  ('SJL-2026-PC15','Agricola Huarmey',                 'Mágica', 294801, 3.50, 2026,11, 45,'firmado','F:F001-960; ant60 cobrado 206.360,70; ADELANTO POR COBRAR 412.721,40'),
  ('SJL-2026-PC16','Agricola Huarmey',                 'Mágica', 260799, 3.50, 2026,11, 45,'firmado','F:F001-960; ant60 cobrado 182.559,30; ADELANTO POR COBRAR 365.118,60'),
  ('SJL-2026-PC17','Agricola Huarmey',                 'Andrea', 241621, 3.50, 2026,11, 45,'firmado','sin factura; ADELANTO POR COBRAR 507.404,10'),
  ('SJL-2026-PC18','Berry Harvest SA',                 'Mágica',  12000, 3.50, 2026, 5, 18,'firmado','F60:F001-955 pag 18/05/2026; ant60 25.200; << fecha despacho no venía en Excel, asumida May-26 >>'),
  -- Clientes NUEVOS
  ('SJL-2026-PC19','Puraberries',                      'Mágica', 371050, 3.50, 2026, 4, 14,'firmado','F60:F001-561 pag 30/12/2025; ant60 779.205; F40:F001-845 pag 23/03/2026; 40% cobrado 519.470'),
  ('SJL-2026-PC20','Agricola Drokasa',                 'Mágica', 666000, 3.50, 2026, 8, 32,'firmado','F60:F001-597 pag 15/01/2026; ant60 1.398.600'),
  ('SJL-2026-PC21','Agricola Cerro Prieto S.A.',       'Mágica',1531100, 3.50, 2026,10, 40,'firmado','ACP. F60:F001-462 pag 24/11/2025; ant60 3.215.310'),
  ('SJL-2026-PC22','Agricola Cerro Prieto S.A.',       'Andrea', 296800, 3.50, 2026,10, 40,'firmado','ACP. F60:F001-462 pag 24/11/2025; ant60 623.280'),
  ('SJL-2026-PC23','Agricola Cerro Prieto S.A.',       'Mágica',  18300, 3.50, 2026,11, 45,'firmado','ACP. F60:F001-867 pag 24/04/2026; ant60 38.430'),
  ('SJL-2026-PC24','Atitlan Berries SAC',              'Mágica',2880000, 3.50, 2026,11, 45,'firmado','F60:F001-438 pag 20/11/2025; ant60 6.048.000'),
  ('SJL-2026-PC25','Atitlan Berries SAC',              'NS16-8', 350000, 3.50, 2026,11, 45,'firmado','F:F001-929; ADELANTO POR COBRAR 735.000'),
  ('SJL-2026-PC26','Atitlan Berries SAC',             'NS15-13', 350000, 3.50, 2026,11, 45,'firmado','F:F001-929; ADELANTO POR COBRAR 735.000'),
  ('SJL-2026-PC27','Agrofutura',                       'Mágica', 420000, 3.50, 2026,10, 40,'firmado','F60:F001-665 pag 09/03/2026; ant60 882.000'),
  ('SJL-2026-PC28','Alteña',                           'NS16-8', 260000, 3.50, 2027, 2,  6,'firmado','F60:F001-880 pag 22/04/2026; ant60 546.000'),
  ('SJL-2026-PC29','Hass Peru',                        'Mágica',  30600, 3.50, 2026, 5, 18,'firmado','F60:F001-952 pag 20/05/2026; ant60 64.260; F40:F001-953 pag 22/05/2026; 40% cobrado 42.840')
),
resolved AS (
  SELECT s.*, c.id AS client_id, vv.id AS variety_id
  FROM stage s
  JOIN LATERAL (
    SELECT id FROM clients
    WHERE country_id='a06525cc-7a40-46d6-b1cb-7b5e3b250c9c'
      AND lower(name)=lower(s.client_match)
    ORDER BY created_at LIMIT 1
  ) c ON true
  JOIN LATERAL (
    SELECT id FROM varieties WHERE name = s.variety_match LIMIT 1
  ) vv ON true
),
ins_contract AS (
  INSERT INTO contracts (number, client_id, organization_id, status, currency,
                         condition, sale_type, total_neto, total_neto_usd, notes)
  SELECT r.num, r.client_id, '1b99b1fe-1349-4397-88dd-e2686e36cf91',
         r.status::contract_status, 'USD'::currency_code,
         'venta'::condition_type, 'exportacion'::sale_type,
         ROUND(r.qty*r.price,2), ROUND(r.qty*r.price,2),
         'Carga campaña Perú 2026-27. '||r.traza
  FROM resolved r
  WHERE NOT EXISTS (SELECT 1 FROM contracts x WHERE x.number=r.num)
  RETURNING id, number
)
-- genetic_program_id = OZ: toda la campaña Perú es de ese programa (el
-- dashboard agrega por contract_items.genetic_program_id, no por la variedad).
INSERT INTO contract_items (contract_id, variety_id, genetic_program_id, qty_plants, unit_price,
                            currency, delivery_year, delivery_month, delivery_week,
                            material_type, notes)
SELECT ic.id, r.variety_id, 'f4999ec9-1e16-4bcc-bc82-3c4c8181b3dc', r.qty, r.price, 'USD'::currency_code,
       r.dyear, r.dmonth, r.dweek, 'vitro'::material_type,
       'Carga campaña Perú 2026-27 (semana aprox). '||r.traza
FROM ins_contract ic
JOIN resolved r ON r.num = ic.number;

-- ---- D. Pagos (cobrados = 'pagado' ; por cobrar = 'pendiente') -------------
-- paid_at NULL = cobrado pero el Excel no traía fecha.
WITH pay(num, ptype, amount, status, paid_at, reference) AS (VALUES
  ('SJL-2026-PC01','anticipo_1',   67200.00, 'pagado',  '2025-12-31','F001-528'),
  ('SJL-2026-PC01','saldo',        44800.00, 'pagado',  '2026-01-29','F001-700'),
  ('SJL-2026-PC02','anticipo_1',   81658.50, 'pagado',  '2025-12-31','F001-529'),
  ('SJL-2026-PC02','saldo',        54439.00, 'pagado',  '2026-04-17','F001-701'),
  ('SJL-2026-PC03','anticipo_1', 1166550.00, 'pagado',  '2025-12-31','F001-527'),
  ('SJL-2026-PC04','anticipo_1', 1399860.00, 'pagado',  '2025-12-31','F001-530'),
  ('SJL-2026-PC04','anticipo_2',  233310.00, 'pendiente', NULL,      'F001-530'),
  ('SJL-2026-PC05','anticipo_1', 1948800.00, 'pagado',  '2025-04-18','F001-624'),
  ('SJL-2026-PC06','anticipo_1',  200000.00, 'pagado',  '2026-03-05','F001-742'),
  ('SJL-2026-PC07','anticipo_1',  609000.00, 'pagado',  '2025-11-17','F001-408'),
  ('SJL-2026-PC08','anticipo_1',    4872.00, 'pagado',  '2026-02-21','F001-776'),
  ('SJL-2026-PC08','saldo',         3248.00, 'pagado',  '2026-02-21','F001-776'),
  ('SJL-2026-PC09','anticipo_1',  378000.00, 'pagado',  '2026-03-09','F001-666'),
  ('SJL-2026-PC10','anticipo_1',    1764.00, 'pagado',  '2026-02-23','F001-716'),
  ('SJL-2026-PC10','saldo',         1176.00, 'pagado',  '2026-02-23','F001-716'),
  ('SJL-2026-PC11','anticipo_1', 1459500.00, 'pagado',  '2026-03-03','F001-768'),
  ('SJL-2026-PC12','anticipo_1',  254520.00, 'pendiente', NULL,       NULL),
  ('SJL-2026-PC13','anticipo_1',  493080.00, 'pagado',    NULL,      'F001-948'),
  ('SJL-2026-PC14','anticipo_1',   54600.00, 'pagado',    NULL,      'F001-947'),
  ('SJL-2026-PC15','anticipo_1',  206360.70, 'pagado',    NULL,      'F001-960'),
  ('SJL-2026-PC15','anticipo_2',  412721.40, 'pendiente', NULL,      'F001-960'),
  ('SJL-2026-PC16','anticipo_1',  182559.30, 'pagado',    NULL,      'F001-960'),
  ('SJL-2026-PC16','anticipo_2',  365118.60, 'pendiente', NULL,      'F001-960'),
  ('SJL-2026-PC17','anticipo_1',  507404.10, 'pendiente', NULL,       NULL),
  ('SJL-2026-PC18','anticipo_1',   25200.00, 'pagado',  '2026-05-18','F001-955'),
  ('SJL-2026-PC19','anticipo_1',  779205.00, 'pagado',  '2025-12-30','F001-561'),
  ('SJL-2026-PC19','saldo',       519470.00, 'pagado',  '2026-03-23','F001-845'),
  ('SJL-2026-PC20','anticipo_1', 1398600.00, 'pagado',  '2026-01-15','F001-597'),
  ('SJL-2026-PC21','anticipo_1', 3215310.00, 'pagado',  '2025-11-24','F001-462'),
  ('SJL-2026-PC22','anticipo_1',  623280.00, 'pagado',  '2025-11-24','F001-462'),
  ('SJL-2026-PC23','anticipo_1',   38430.00, 'pagado',  '2026-04-24','F001-867'),
  ('SJL-2026-PC24','anticipo_1', 6048000.00, 'pagado',  '2025-11-20','F001-438'),
  ('SJL-2026-PC25','anticipo_1',  735000.00, 'pendiente', NULL,      'F001-929'),
  ('SJL-2026-PC26','anticipo_1',  735000.00, 'pendiente', NULL,      'F001-929'),
  ('SJL-2026-PC27','anticipo_1',  882000.00, 'pagado',  '2026-03-09','F001-665'),
  ('SJL-2026-PC28','anticipo_1',  546000.00, 'pagado',  '2026-04-22','F001-880'),
  ('SJL-2026-PC29','anticipo_1',   64260.00, 'pagado',  '2026-05-20','F001-952'),
  ('SJL-2026-PC29','saldo',        42840.00, 'pagado',  '2026-05-22','F001-953')
)
INSERT INTO payments (contract_id, type, amount, currency, status, paid_at, reference)
SELECT ct.id, p.ptype::payment_type, p.amount, 'USD'::currency_code,
       p.status::payment_status, p.paid_at::date, p.reference
FROM pay p
JOIN contracts ct ON ct.number = p.num
WHERE NOT EXISTS (SELECT 1 FROM payments x WHERE x.contract_id = ct.id);

-- ---- D2. Saldo 40% pendiente (obligación real aunque el Excel no lo facturó) -
-- Agrega 'saldo' pendiente = 40% del total a todos los PC, EXCEPTO:
--   - los que ya tienen 'saldo' pagado (contratos 100% cobrados),
--   - PC06 (anulado),
--   - PC04 (cifras Excel irregulares, no sigue 60/40 -> revisión manual).
INSERT INTO payments (contract_id, type, amount, currency, status)
SELECT ct.id, 'saldo'::payment_type, ROUND(ct.total_neto*0.40,2), 'USD'::currency_code, 'pendiente'::payment_status
FROM contracts ct
WHERE ct.number LIKE 'SJL-2026-PC%'
  AND ct.number NOT IN ('SJL-2026-PC04','SJL-2026-PC06')
  AND ct.status <> 'cancelado'
  AND NOT EXISTS (SELECT 1 FROM payments p WHERE p.contract_id=ct.id AND p.type='saldo');

-- ---- Verificación (dry run) -----------------------------------------------
SELECT ct.number, c.name AS cliente, vr.name AS variedad, ci.qty_plants, ci.unit_price,
       ROUND(ci.qty_plants*ci.unit_price,2) AS usd,
       ci.delivery_year, ci.delivery_month, ct.status
FROM contracts ct
JOIN clients c ON c.id=ct.client_id
JOIN contract_items ci ON ci.contract_id=ct.id
JOIN varieties vr ON vr.id=ci.variety_id
WHERE ct.number LIKE 'SJL-2026-PC%'
ORDER BY ct.number;

SELECT COUNT(*) AS contratos_cargados,
       SUM(ci.qty_plants) AS plantas,
       ROUND(SUM(ci.qty_plants*ci.unit_price),2) AS usd_total
FROM contracts ct JOIN contract_items ci ON ci.contract_id=ct.id
WHERE ct.number LIKE 'SJL-2026-PC%';

-- Pagos: cuántos y cuánto por status
SELECT p.status, COUNT(*) AS n_pagos, ROUND(SUM(p.amount),2) AS monto
FROM payments p JOIN contracts ct ON ct.id=p.contract_id
WHERE ct.number LIKE 'SJL-2026-PC%'
GROUP BY p.status ORDER BY p.status;

-- ============================================================================
-- Termina en ROLLBACK = NO persiste (dry run). Cambiar a COMMIT para cargar.
-- ============================================================================
ROLLBACK;
-- COMMIT;
