/**
 * Tipos compartidos del módulo de Clientes.
 *
 * Vive aparte de `clientes.ts` (que está marcado con "use server" y por lo
 * tanto solo puede exportar funciones async). Los tipos puros y schemas Zod
 * los importan client- y server-components.
 */

import { z } from "zod";

import type { Database } from "@/lib/database.types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const DEFAULT_PAGE_SIZE = 50;

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ClientListItem = {
  id: string;
  name: string;
  legal_name: string | null;
  tax_id: string | null;
  giro: string | null;
  region: string | null;
  notes: string | null;
  is_active: boolean;
  source: string | null;
  created_at: string;
  updated_at: string;
  country: { id: string; name_es: string; iso2: string } | null;
  owner: { id: string; full_name: string | null; email: string | null } | null;
  active_contracts: number;
  last_activity_at: string | null;
};

export type ListClientsResult = {
  data: ClientListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; field?: string };

export type CountryOption = {
  id: string;
  name_es: string;
  iso2: string;
};

export type OwnerOption = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ClientRow = Database["public"]["Tables"]["clients"]["Row"];

export type ClientDetail = {
  client: ClientRow & {
    country: { id: string; name_es: string; iso2: string } | null;
    owner: { id: string; full_name: string | null; email: string | null } | null;
  };
  counts: {
    contracts: number;
    opportunities: number;
    contacts: number;
    addresses: number;
  };
  contacts: Database["public"]["Tables"]["client_contacts"]["Row"][];
  addresses: (Database["public"]["Tables"]["client_addresses"]["Row"] & {
    country: { id: string; name_es: string; iso2: string } | null;
  })[];
  contracts: Pick<
    Database["public"]["Tables"]["contracts"]["Row"],
    | "id"
    | "number"
    | "status"
    | "total_neto"
    | "total_neto_usd"
    | "currency"
    | "signed_at"
    | "created_at"
  >[];
  opportunities: Pick<
    Database["public"]["Tables"]["opportunities"]["Row"],
    | "id"
    | "name"
    | "stage_id"
    | "estimated_value"
    | "estimated_value_usd"
    | "expected_close_date"
    | "probability_pct"
    | "currency"
    | "created_at"
  >[];
  activity: Database["public"]["Tables"]["activity_log"]["Row"][];
};

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const trimmedString = (max = 255) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v.length === 0 ? null : v));

export const createClientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "El nombre debe tener al menos 2 caracteres")
    .max(255),
  legal_name: trimmedString().nullable().optional(),
  tax_id: trimmedString(64).nullable().optional(),
  giro: trimmedString().nullable().optional(),
  country_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  region: trimmedString().nullable().optional(),
  notes: z
    .string()
    .trim()
    .max(5000)
    .transform((v) => (v.length === 0 ? null : v))
    .nullable()
    .optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

export const updateClientSchema = createClientSchema.extend({
  account_owner_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  is_active: z.boolean().optional(),
});

export type UpdateClientInput = z.infer<typeof updateClientSchema>;

export const createContactSchema = z.object({
  name: z.string().trim().min(2, "Nombre requerido").max(255),
  email: z
    .string()
    .trim()
    .max(255)
    .email("Email inválido")
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
  phone: trimmedString(64).nullable().optional(),
  role: trimmedString(128).nullable().optional(),
  notes: trimmedString(2000).nullable().optional(),
  is_primary: z.boolean().optional().default(false),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

export const createAddressSchema = z.object({
  type: z.enum(["fiscal", "envio", "otra"]).nullable().optional(),
  line1: trimmedString().nullable().optional(),
  line2: trimmedString().nullable().optional(),
  region: trimmedString(128).nullable().optional(),
  postal_code: trimmedString(32).nullable().optional(),
  country_id: z
    .string()
    .uuid()
    .nullable()
    .optional()
    .or(z.literal("").transform(() => null)),
});

export type CreateAddressInput = z.infer<typeof createAddressSchema>;
