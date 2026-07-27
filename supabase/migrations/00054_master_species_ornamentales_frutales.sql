-- 00054 — Especies maestras faltantes (ornamentales + frutales + del lab)
--
-- Decisión del usuario (2026-07-27): agregar a los maestros compartidos las
-- especies que el vivero produce pero que el CRM no tenía, porque su catálogo
-- nació berry-céntrico (Arándano, Frambuesa, Mora, Avellano, Murtilla…).
--
-- Sin estas especies, 28 variedades del planner no pueden vincularse a maestros,
-- y sin ese vínculo no hay cruce con contratos ni programa genético. El botón
-- "vincular variedad" de /planner/movimientos las rechazaba correctamente: crear
-- una especie del CRM es decisión de negocio, no algo a automatizar.
--
-- Antes de crear se cruzaron las TRES fuentes para no duplicar (aviso del
-- usuario: "puede que en el archivo del laboratorio estén con nombre
-- científico"):
--   · maestros del CRM (8 especies)
--   · catálogo del planner (15 especies)
--   · "Salidas confirmadas 2026" / hoja Salidas Vitro (17 especies del lab IVL)
--
-- Hallazgos del cruce:
--   1. El lab NO usa nombres científicos: los 17 son nombres comunes. Agapanthus,
--      Echinacea, Hibiscus y Lavandula son géneros latinos, pero son los nombres
--      con que se comercializan — no son duplicados de nada.
--   2. **"Ficcus" del planner es un typo**: el lab escribe "Ficus". Se crea el
--      nombre correcto y el planner se vincula por id explícito (§ al final).
--   3. **"Prunus" NO se crea**: aparece en el inventario (2 filas) y es el GÉNERO
--      de cerezo/almendro/ciruelo/durazno → es ambiguo, no una especie. Hay que
--      resolver a mano a cuál de las cuatro corresponde.
--   4. El lab entrega 4 especies que no estaban ni en el CRM ni en el planner:
--      Echinacea (29 variedades, 38.300 pl), Palto (8), Hibiscus (6), Kiwi (2).
--      Se incluyen ahora para no necesitar otra migración al importar el plan
--      del laboratorio.
--
-- NO se crea "Arándano Cutting": no es una especie, es Arándano con origen
-- cutting. Colapsa al implementar el campo `origen` — ver la nota del vault
-- "Planner - Modelo de Lotes, Origen y Libro Mayor".

insert into public.species (name, code)
select v.name, v.code
from (values
  -- ornamentales
  ('Agapanthus',  'AGA'),
  ('Rododendros', 'ROD'),
  ('Echinacea',   'ECH'),
  ('Hibiscus',    'HIB'),
  ('Lavandula',   'LAV'),
  ('Ficus',       'FIC'),
  -- frutales mayores / otros
  ('Cerezo',      'CER'),
  ('Almendro',    'ALM'),
  ('Ciruelo',     'CIR'),
  ('Durazno',     'DUR'),
  ('Nogal',       'NOG'),
  ('Castaño',     'CAS'),
  ('Palto',       'PAL'),
  ('Kiwi',        'KIW')
) as v(name, code)
where not exists (
  select 1 from public.species s
  where lower(s.name) = lower(v.name) and s.deleted_at is null
);

-- Vincular las especies del planner por nombre (una sola vez; de acá en adelante
-- el vínculo vive como FK por id y sobrevive a cualquier rename).
update public.planner_species ps
set master_species_id = s.id
from public.species s
where ps.master_species_id is null
  and s.deleted_at is null
  and lower(trim(s.name)) = lower(trim(ps.name));

-- Caso especial: el planner escribe "Ficcus" (typo) y el maestro quedó "Ficus".
-- Se vincula explícitamente para no arrastrar el typo a los maestros.
update public.planner_species ps
set master_species_id = (
  select s.id from public.species s
  where lower(s.name) = 'ficus' and s.deleted_at is null limit 1
)
where ps.master_species_id is null
  and lower(trim(ps.name)) in ('ficcus', 'ficus');

-- Vincular variedades del planner a su maestra, ACOTANDO por especie.
-- El `relinkPlannerCatalogs` de la app matchea nombres de variedad de forma
-- GLOBAL, sin acotar por especie, y eso ya produjo un vínculo cruzado
-- (planner "Durazno / Atlas" → maestro "Portainjerto / Atlas"; ese caso queda
-- para revisión manual porque Atlas SÍ es un portainjerto de carozo).
-- Acá se acota, y solo se vincula si el nombre es único dentro de esa especie.
update public.planner_varieties pv
set master_variety_id = m.id
from public.varieties m
join public.species ms on ms.id = m.species_id
join public.planner_species ps on ps.master_species_id = ms.id
where pv.master_variety_id is null
  and pv.species_id = ps.id
  and m.deleted_at is null
  and ms.deleted_at is null
  and lower(trim(m.name)) = lower(trim(pv.name))
  and (
    select count(*) from public.varieties m2
    where m2.species_id = ms.id and m2.deleted_at is null
      and lower(trim(m2.name)) = lower(trim(pv.name))
  ) = 1;

notify pgrst, 'reload schema';
