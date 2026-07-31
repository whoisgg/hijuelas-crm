import { cache } from "react";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";

/**
 * Alcance de datos por PAÍS DE OPERACIÓN.
 *
 * Es una dimensión distinta del contexto vivero/agrícola (ver lib/constants):
 * el contexto decide QUÉ VISTA se dibuja, el scope decide QUÉ FILAS entran.
 * La UI es idéntica en Chile y en Perú; lo que cambia es el universo de datos
 * y la existencia de una vista consolidada del grupo.
 *
 * El país operativo NO es un campo nuevo: es el país de la SOCIEDAD vendedora
 * (`organizations.country_id`), que ya está poblado — 9 sociedades en Chile,
 * Inversiones San Juan de la Luz en Perú, Zoe Nursery en México. Por eso el
 * scope se resuelve siempre a una lista de `organization_id` y se aplica sobre
 * las dos raíces transaccionales que la tienen: `contracts` y `opportunities`.
 *
 * OJO con `clients`: no tiene `organization_id`, y su `country_id` es el país
 * de DESTINO de la venta, no el de la operación (un mismo cliente puede
 * comprarle a Chile y a Perú). "Clientes de Perú" bajo este scope es derivado
 * —los que tienen contratos de una sociedad peruana—, no una columna.
 *
 * El valor vive en una cookie del servidor, no en el cliente: así el filtro se
 * aplica en el server component / server action y no depende de lo que mande
 * el navegador.
 */

export const SCOPE_COOKIE = "gh_pais";
/** Valor de la cookie para "todo el grupo" (sin filtro). */
export const SCOPE_ALL = "all";

export type ScopeCountry = {
  id: string;
  iso2: string;
  name: string;
  /** sociedades del grupo en ese país */
  orgIds: string[];
};

export type DataScope = {
  /** null = consolidado (todo el grupo) */
  country: ScopeCountry | null;
  /** países con operación, para el selector */
  countries: ScopeCountry[];
  /** null = sin filtro; si no, las sociedades del país elegido */
  orgIds: string[] | null;
};

/**
 * Países donde el grupo opera, derivados de las sociedades activas. Se cachea
 * por request: lo consultan el switcher y cada acción que filtra.
 */
export const getScopeCountries = cache(async (): Promise<ScopeCountry[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("id, country_id, countries!organizations_country_id_fkey(id, iso2, name_es)")
    .is("deleted_at", null)
    .eq("active", true);

  const byCountry = new Map<string, ScopeCountry>();
  for (const row of data ?? []) {
    const c = (row as unknown as {
      countries: { id: string; iso2: string; name_es: string } | null;
    }).countries;
    if (!c) continue;
    const entry = byCountry.get(c.id) ?? {
      id: c.id,
      iso2: c.iso2,
      name: c.name_es,
      orgIds: [],
    };
    entry.orgIds.push(row.id);
    byCountry.set(c.id, entry);
  }
  return [...byCountry.values()].sort((a, b) => a.name.localeCompare(b.name));
});

/**
 * Scope vigente del request. Un país desconocido (o una cookie manipulada)
 * cae a consolidado en vez de fallar — y nunca amplía lo que el usuario ve.
 */
export const getDataScope = cache(async (): Promise<DataScope> => {
  const countries = await getScopeCountries();
  const raw = (await cookies()).get(SCOPE_COOKIE)?.value;
  const country =
    raw && raw !== SCOPE_ALL
      ? countries.find((c) => c.iso2 === raw.toUpperCase()) ?? null
      : null;
  return {
    country,
    countries,
    orgIds: country ? country.orgIds : null,
  };
});

/** Sociedades del scope, o null si es consolidado. Para el CRM, que cuelga de
 *  `contracts.organization_id` / `opportunities.organization_id`. */
export async function scopeOrgIds(): Promise<string[] | null> {
  return (await getDataScope()).orgIds;
}

/** País del scope, o null si es consolidado. Para los módulos operativos, que
 *  cuelgan del país directo (`planner_areas.country_id`,
 *  `bodega_bodegas.country_id`) y no de una sociedad vendedora. */
export async function scopeCountryId(): Promise<string | null> {
  return (await getDataScope()).country?.id ?? null;
}
