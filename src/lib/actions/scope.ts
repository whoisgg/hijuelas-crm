"use server";

import { cookies } from "next/headers";

import { getScopeCountries, SCOPE_ALL, SCOPE_COOKIE } from "@/lib/scope";

/**
 * Guarda el alcance por país. Valida contra los países donde el grupo
 * realmente opera: un iso2 inventado cae a consolidado, nunca abre datos que
 * el filtro no contemple.
 */
export async function setDataScope(iso2: string | null) {
  const countries = await getScopeCountries();
  const valid =
    iso2 && countries.some((c) => c.iso2 === iso2.toUpperCase())
      ? iso2.toUpperCase()
      : SCOPE_ALL;

  (await cookies()).set(SCOPE_COOKIE, valid, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return { ok: true as const, scope: valid };
}
