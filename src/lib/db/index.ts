import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { schema } from "./schema";

declare global {
  var __hijuelas_pg__: ReturnType<typeof postgres> | undefined;
}

function getConnection() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "Falta DATABASE_URL. Configura la URL de Postgres de Supabase en .env.local.",
    );
  }

  // Reusar la conexión en dev (HMR) para evitar agotar el pool.
  if (process.env.NODE_ENV !== "production") {
    if (!globalThis.__hijuelas_pg__) {
      globalThis.__hijuelas_pg__ = postgres(connectionString, { prepare: false });
    }
    return globalThis.__hijuelas_pg__;
  }

  return postgres(connectionString, { prepare: false });
}

export const db = drizzle(getConnection(), { schema });
export type Database = typeof db;
