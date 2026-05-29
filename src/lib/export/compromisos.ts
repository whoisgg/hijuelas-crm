// Cabeceras y tipo del export "Compromisos" — replica fiel de la planilla
// original `BBDD ventas.xlsx` (hoja "Compromisos"), una fila por contract_item.
// Vive en un módulo plano (NO "use server") para poder compartir la constante
// entre la server action y el componente cliente que arma el .xlsx.

export const EXPORT_COMPROMISOS_HEADERS = [
  "País origen",
  "País Destino",
  "Región",
  "Empresa vendedora",
  "Cliente",
  "# Contrato",
  "Situación Contrato",
  "Situación Anticipo 1",
  "Situación Anticipo 2",
  "Condición",
  "Tipo de venta",
  "Centro de costo",
  "Especie",
  "Variedad",
  "Tipo de material",
  "Situación entrega",
  "Programa genético",
  "Formato",
  "Moneda",
  "Incoterm",
  "Rut",
  "Giro",
  "Comentario",
  "Contacto",
  "Teléfono de contacto",
  "Mail",
  "Punto contacto",
  "# plantas",
  "# entregada",
  "Valor planta",
  "Año entrega",
  "Mes entrega",
  "Wk entrega",
  "Total Neto",
  "Total IVA",
  "Anticipo 1",
  "IVA anticipo 1",
  "Anticipo 2",
  "IVA anticipo 2",
  "Saldo",
  "IVA saldo",
] as const;

export type ExportCompromisosHeader = (typeof EXPORT_COMPROMISOS_HEADERS)[number];

export type ExportCompromisosRow = Record<ExportCompromisosHeader, string | number | null>;
