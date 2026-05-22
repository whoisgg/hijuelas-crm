import { defineConfig } from "drizzle-kit";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  // No lanzamos error en import-time; drizzle-kit valida en runtime.
  // Solo avisamos por consola para debugging.
  console.warn(
    "[drizzle] DATABASE_URL no está definido. drizzle-kit fallará al ejecutar.",
  );
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl ?? "",
  },
  strict: true,
  verbose: true,
});
