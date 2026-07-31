-- 00067 — geometría real de planner_areas (vista georreferenciada)
--
-- Extraída de V.H.Hardening.kmz (analizado 2026-07-27, ver vault "Planner -
-- Modelo de Lotes, Origen y Libro Mayor.md" § El KMZ): 8 polígonos con
-- coordenadas reales en Hijuelas (-32.830, -71.124). 7 corresponden a
-- planner_areas existentes; HFM no está en el KMZ, queda sin geometría a
-- propósito. El 8vo polígono, "Hardening", NO es un área productiva —
-- contiene Zona Clara y Zona Oscura, es una capa de agrupación visual —
-- se maneja como constante en el frontend (/planner/mapa), no en esta tabla.

alter table planner_areas add column if not exists geometry jsonb;
comment on column planner_areas.geometry is 'Polígono real [[lng,lat],...] del KMZ V.H.Hardening.kmz, para la vista georreferenciada (/planner/mapa). Null = sin delimitar en el KMZ (ej. HFM).';

update planner_areas set geometry = '[[-71.1253756492153,-32.82994848159041],[-71.12500414577131,-32.83032176265287],[-71.1245990322813,-32.83002715878907],[-71.1249686551222,-32.82965619087943],[-71.1252093400232,-32.82982799873406],[-71.12516528567252,-32.82987323135728],[-71.12525578907231,-32.82993470968864],[-71.1252965675368,-32.82989341383961],[-71.1253756492153,-32.82994848159041]]'::jsonb where id = 1; -- Góticos

update planner_areas set geometry = '[[-71.12486084901609,-32.82955147092778],[-71.12449591141996,-32.82992284400252],[-71.12404561800467,-32.82961439221371],[-71.12442399502717,-32.8292427597757],[-71.12486084901609,-32.82955147092778]]'::jsonb where id = 2; -- TunelTek

update planner_areas set geometry = '[[-71.12401003610941,-32.83106146349299],[-71.12379669204714,-32.83119688102616],[-71.1235984705432,-32.830961957924],[-71.12381511484931,-32.83083665472213],[-71.12401003610941,-32.83106146349299]]'::jsonb where id = 3; -- Zona Oscura

update planner_areas set geometry = '[[-71.12429265439665,-32.83089299839712],[-71.12380017917575,-32.83029552663231],[-71.12329989180313,-32.83060516228191],[-71.12358988527052,-32.83095362007296],[-71.12381862905409,-32.83082410177447],[-71.12401890636986,-32.83105817772024],[-71.12429265439665,-32.83089299839712]]'::jsonb where id = 4; -- Zona Clara

update planner_areas set geometry = '[[-71.123531158437,-32.82974620769242],[-71.122893286896,-32.83009355837436],[-71.1225883109824,-32.82971963182181],[-71.12322139118828,-32.82936159827765],[-71.123531158437,-32.82974620769242]]'::jsonb where id = 5; -- Módulo 1

update planner_areas set geometry = '[[-71.12422689898209,-32.82999987035323],[-71.12323508155195,-32.83053955204688],[-71.12292189173526,-32.830160101503],[-71.12392115996388,-32.82961136591914],[-71.12422689898209,-32.82999987035323]]'::jsonb where id = 6; -- Módulo 2

update planner_areas set geometry = '[[-71.12279938329429,-32.83015474287993],[-71.12224010548955,-32.83046333565895],[-71.1218763412296,-32.82999765802889],[-71.1224291418725,-32.82969595819488],[-71.12279938329429,-32.83015474287993]]'::jsonb where id = 14; -- Módulo 3
