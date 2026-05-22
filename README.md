# Hijuelas CRM

CRM interno para administrar **contratos de venta** y **oportunidades de negocio** de plantas de Viveros Hijuelas y empresas relacionadas (Zoe Nursery México, Viveros VH, Frutivar, In Vitro Lab, etc.). Reemplaza el Excel `BBDD ventas.xlsx`.

> Proyecto independiente. Repo destino: `~/Dev/hijuelas-crm/` (NO se monta dentro de `nefuentrading`).

## Stack

| Capa | Tecnología |
|------|------------|
| Frontend | Next.js (App Router, RSC, Server Actions) + Tailwind v4 + shadcn/ui |
| Backend / DB | Supabase (Postgres + Auth + Storage + Realtime + RLS) |
| ORM | Drizzle (migrations versionadas, type-safe) |
| Validación | Zod |
| Grids | TanStack Table |
| Auth | Supabase magic link |
| State server | TanStack Query |
| Forms | React Hook Form + Zod resolver |
| Iconos | Lucide |
| Toasts | Sonner |
| Dark mode | next-themes |
| Package manager | pnpm |

## Setup

1. **Instalar dependencias**
   ```bash
   pnpm install
   ```

2. **Variables de entorno**
   - Copiá `.env.example` a `.env.local` (ya viene un `.env.local` con placeholders).
   - Pegá los valores reales desde [Supabase Dashboard → `hijuelas-crm` → Settings → API](https://supabase.com/dashboard/project/hvlwkmyftnrasebecaet/settings/api):
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY` (clave `anon public`)
     - `SUPABASE_SERVICE_ROLE_KEY` (clave `service_role` — mantener secreta)
   - Pegá la connection string de Postgres desde Settings → Database:
     - `DATABASE_URL` (pooler, transaction mode)
     - `DIRECT_URL` (URI directa para drizzle-kit)

3. **Dev server**
   ```bash
   pnpm dev
   ```
   Abrir [http://localhost:3000](http://localhost:3000) — redirige a `/login`.

## Estructura

```
src/
  app/
    (auth)/login/        — magic link login
    (app)/               — rutas protegidas con sidebar + topbar
      dashboard/
      clientes/
      contratos/
      oportunidades/
      calendario/
      mapa/
      catalogo/
      reportes/
      compartir/
    auth/callback/       — handler del magic link
  components/
    ui/                  — shadcn primitives
    layout/              — AppShell, Sidebar, Topbar, AppLauncher, GlobalSearch
    design-system/       — componentes custom (PathStepper, HighlightsPanel, etc.) [TODO Sprint 0]
  lib/
    supabase/            — clients browser / server / middleware
    db/                  — Drizzle schema + client [TODO Sprint 1]
    constants.ts         — APP_NAME, NAV_ITEMS, etc.
    utils.ts             — cn() helper
  middleware.ts          — refresh de sesión Supabase + protección de rutas

supabase/
  migrations/            — SQL migrations (drizzle-kit)
  config.toml            — Supabase CLI

drizzle.config.ts
.env.example             — documentación de envs
.env.local               — placeholders (NO commit)
```

## Scripts

| Script | Acción |
|--------|--------|
| `pnpm dev` | Servidor de desarrollo con Turbopack |
| `pnpm build` | Build de producción |
| `pnpm start` | Servir build de producción |
| `pnpm lint` | ESLint |

## Referencias

Vision, modelo de datos, UI/UX y sprints documentados en Obsidian:

- `2BGG/02 - Projects/hijuelascrm/Hijuelas CRM - Master Plan.md`
- `2BGG/02 - Projects/hijuelascrm/Hijuelas CRM - UI UX Inspiracion Salesforce.md`
- `2BGG/02 - Projects/hijuelascrm/Hijuelas CRM - Modelo de Datos.md`
- `2BGG/02 - Projects/hijuelascrm/Hijuelas CRM - Modulo Oportunidades.md`
- `2BGG/02 - Projects/hijuelascrm/Hijuelas CRM - Calidad de Datos Inicial.md`

## Estado actual

**Sprint 0 — Foundation** (en curso):

- [x] Scaffold Next.js + Tailwind v4 + shadcn
- [x] Supabase clients (browser/server/middleware)
- [x] Auth con magic link + middleware de protección
- [x] App shell (Topbar + Sidebar + AppLauncher + GlobalSearch + ThemeToggle)
- [x] 9 stub pages (Dashboard, Clientes, Contratos, Oportunidades, Calendario, Mapa, Catálogo, Reportes, Compartir)
- [ ] 10 componentes del Design System v1 — los hace otro agente
- [ ] Schema Drizzle inicial — lo hace otro agente

## Notas

- Idioma UI: **español**. Datos pueden incluir EN/PT (clientes LATAM + Europa).
- Dark mode nativo (toggle en topbar, default = system).
- Sidebar colapsado por defecto (w-14), expande a w-56 en hover.
- Iconografía Lucide únicamente. Sin emojis decorativos.
