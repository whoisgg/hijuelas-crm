-- Hijuelas CRM - Extensions and ENUM types
-- Applied: 2026-05-22

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS citext;

DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'sales', 'finance', 'viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE contract_status AS ENUM (
    'borrador', 'por_revisar', 'firmado', 'en_proceso', 'finalizado', 'cancelado'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_type AS ENUM ('anticipo_1', 'anticipo_2', 'saldo');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE payment_status AS ENUM ('pendiente', 'pagado', 'vencido');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE delivery_status AS ENUM ('pendiente', 'en_proceso', 'finalizado', 'eliminado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE royalty_status AS ENUM ('no_califica', 'pendiente', 'pagado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE condition_type AS ENUM ('venta', 'reposicion', 'muestra');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE sale_type AS ENUM ('nacional', 'exportacion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE material_type AS ENUM ('vitro', 'raiz_cubierta', 'otros');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE currency_code AS ENUM ('CLP', 'USD', 'EUR');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE share_scope AS ENUM ('cliente', 'contrato', 'calendario', 'mapa', 'dashboard');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE share_permission AS ENUM ('view', 'comment', 'edit_suggested');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE amendment_type AS ENUM ('withdraw', 'modify', 'add');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE activity_type AS ENUM ('call', 'email', 'meeting', 'task', 'note');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
