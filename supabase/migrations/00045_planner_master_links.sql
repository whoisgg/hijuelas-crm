-- Vínculo planner ↔ maestros compartidos del CRM: los catálogos del planner
-- referencian el id maestro en vez de duplicar por nombre. Backfill por nombre
-- normalizado (minúsculas, sin acentos, sin prefijo "Cutting "); las variedades
-- solo se vinculan cuando el nombre normalizado es único en los maestros.

alter table planner_species
  add column if not exists master_species_id uuid references species(id) on delete set null;

alter table planner_varieties
  add column if not exists master_variety_id uuid references varieties(id) on delete set null;

create or replace function _planner_norm_name(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
    lower(trim(translate(p, 'áéíóúñüÁÉÍÓÚÑÜ', 'aeiounuAEIOUNU'))),
    '^cutting ', ''
  );
$$;

-- Especies: match 1:1 por nombre normalizado.
update planner_species ps
set master_species_id = s.id
from species s
where ps.master_species_id is null
  and s.deleted_at is null
  and _planner_norm_name(ps.name) = _planner_norm_name(s.name);

-- Variedades: solo nombres normalizados únicos en los maestros (sin ambigüedad).
with unique_master as (
  select _planner_norm_name(name) as n, min(id::text)::uuid as id
  from varieties
  where deleted_at is null
  group by 1
  having count(*) = 1
)
update planner_varieties pv
set master_variety_id = um.id
from unique_master um
where pv.master_variety_id is null
  and _planner_norm_name(pv.name) = um.n;
