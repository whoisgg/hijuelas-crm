/**
 * Catálogos estáticos del módulo Bodega e Insumos (mismos valores que
 * Ventory para que la migración de datos calce). Bodegas y unidades de
 * medida son administrables y viven en tablas (bodega_bodegas /
 * bodega_unidades); esto es lo que no necesita CRUD.
 */

export const BODEGA_CATEGORIAS = [
  "SIN DEFINIR",
  "LIBRERIA",
  "ASEO",
  "TRANSFER",
  "AGUA",
  "EPP",
  "MANTENCION",
  "MEDIO",
  "OFICINA",
  "BODEGA",
  "P. AUXILIO",
  "INSUMO",
  "EMBARQUE",
  "OTROS",
] as const;

export const BODEGA_TIPOS_INVENTARIO = ["GENERAL", "MEDIOS & POTES"] as const;

export const BODEGA_AREAS_DESTINO = [
  "HARDENING ESTERIL",
  "FRUTALES",
  "CIDI",
  "MANTENCION",
  "ASEO",
  "OSORNO",
  "MEDIOS",
  "CHEQUEO",
  "TRANSFER",
  "DESPACHO",
  "LAVADERO",
  "ADMINISTRACION",
  "BODEGA IVL",
  "CONSUMO INTERNO",
  "CONSUMO EXTERNO",
  "MERMA",
  "OTROS",
] as const;

export const BODEGA_ESTADO_STOCK: Record<
  string,
  { label: string; tone: "danger" | "warning" | "ok" }
> = {
  urgente: { label: "Urgente: sin stock", tone: "danger" },
  bajo: { label: "Stock bajo", tone: "warning" },
  suficiente: { label: "Suficiente", tone: "ok" },
};
