import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
} from "pdf-lib";

/**
 * Generador de PDF *provisional* del contrato.
 *
 * Es un template mínimo para tener "Enviar a firmar" funcionando end-to-end
 * ANTES de recibir el .docx oficial (ver docs/firma-electronica-plan.md §"Pendiente
 * urgente" y docs/docusign-integration-plan.md §7). Cuando llegue el contrato base
 * real, reemplazar `generateContractPdf` por el render del template parametrizado.
 *
 * El PDF incluye el ancla de firma "/sn1/" en el bloque inferior; DocuSign coloca
 * el tab signHere sobre ese texto (ver client.ts → anchorString "/sn1/").
 */

export type ContractPdfItem = {
  variety_name: string | null;
  qty_plants: number;
  unit_price: number;
  currency: string;
  delivery_year: number | null;
  delivery_week: number | null;
};

export type ContractPdfData = {
  number: string;
  condition: string | null;
  clientName: string | null;
  clientTaxId: string | null;
  organizationName: string | null;
  currency: string;
  totalNeto: number;
  totalIva: number;
  totalNetoUsd: number;
  incoterm: string | null;
  signerName: string;
  items: ContractPdfItem[];
  /** Fecha de generación en ISO (la inyecta el server action; aquí no se usa Date.now). */
  generatedAtIso: string;
};

const PAGE_W = 595.28; // A4 en puntos
const PAGE_H = 841.89;
const MARGIN = 56;
const INK = rgb(0.13, 0.13, 0.14);
const MUTED = rgb(0.42, 0.45, 0.46);
const LINE = rgb(0.82, 0.84, 0.85);
const ACCENT = rgb(0.05, 0.42, 0.28); // verde Hijuelas

function fmtMoney(n: number, currency: string): string {
  const v = Number(n || 0).toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${v}`;
}

function fmtInt(n: number): string {
  return Number(n || 0).toLocaleString("es-CL");
}

export async function generateContractPdf(
  data: ContractPdfData,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);

  let page = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const text = (
    s: string,
    x: number,
    yPos: number,
    opts: { font?: PDFFont; size?: number; color?: typeof INK } = {},
  ) => {
    page.drawText(s, {
      x,
      y: yPos,
      size: opts.size ?? 10,
      font: opts.font ?? font,
      color: opts.color ?? INK,
    });
  };

  const hr = (yPos: number) => {
    page.drawLine({
      start: { x: MARGIN, y: yPos },
      end: { x: PAGE_W - MARGIN, y: yPos },
      thickness: 0.75,
      color: LINE,
    });
  };

  const ensureSpace = (needed: number) => {
    if (y - needed < MARGIN + 120) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  // ---- Encabezado ----------------------------------------------------------
  text(data.organizationName ?? "Viveros Hijuelas", MARGIN, y, {
    font: bold,
    size: 16,
    color: ACCENT,
  });
  y -= 18;
  text("Contrato de venta de plantas", MARGIN, y, {
    font,
    size: 11,
    color: MUTED,
  });
  text(`N° ${data.number}`, PAGE_W - MARGIN - 160, PAGE_H - MARGIN, {
    font: bold,
    size: 12,
  });
  text(`Fecha: ${data.generatedAtIso.slice(0, 10)}`, PAGE_W - MARGIN - 160, PAGE_H - MARGIN - 16, {
    font,
    size: 9,
    color: MUTED,
  });
  y -= 14;
  hr(y);
  y -= 22;

  // ---- Partes --------------------------------------------------------------
  text("VENDEDOR", MARGIN, y, { font: bold, size: 9, color: MUTED });
  text("COMPRADOR", PAGE_W / 2, y, { font: bold, size: 9, color: MUTED });
  y -= 14;
  text(data.organizationName ?? "—", MARGIN, y, { font: bold });
  text(data.clientName ?? "—", PAGE_W / 2, y, { font: bold });
  y -= 13;
  if (data.clientTaxId) {
    text(`RUT/RFC: ${data.clientTaxId}`, PAGE_W / 2, y, {
      size: 9,
      color: MUTED,
    });
  }
  y -= 10;
  text(
    `Condición: ${data.condition ?? "venta"}${
      data.incoterm ? `   ·   Incoterm: ${data.incoterm}` : ""
    }`,
    MARGIN,
    y,
    { size: 9, color: MUTED },
  );
  y -= 20;
  hr(y);
  y -= 20;

  // ---- Tabla de items ------------------------------------------------------
  text("DETALLE", MARGIN, y, { font: bold, size: 9, color: MUTED });
  y -= 16;

  const cols = {
    variety: MARGIN,
    qty: MARGIN + 230,
    price: MARGIN + 320,
    entrega: MARGIN + 420,
  };
  text("Variedad", cols.variety, y, { font: bold, size: 9 });
  text("Plantas", cols.qty, y, { font: bold, size: 9 });
  text("P. unitario", cols.price, y, { font: bold, size: 9 });
  text("Entrega", cols.entrega, y, { font: bold, size: 9 });
  y -= 6;
  hr(y);
  y -= 14;

  for (const it of data.items) {
    ensureSpace(16);
    text((it.variety_name ?? "—").slice(0, 40), cols.variety, y, { size: 9 });
    text(fmtInt(it.qty_plants), cols.qty, y, { size: 9 });
    text(fmtMoney(it.unit_price, it.currency), cols.price, y, { size: 9 });
    const entrega =
      it.delivery_year && it.delivery_week
        ? `Sem ${it.delivery_week}/${it.delivery_year}`
        : it.delivery_year
          ? String(it.delivery_year)
          : "—";
    text(entrega, cols.entrega, y, { size: 9 });
    y -= 15;
  }

  y -= 4;
  hr(y);
  y -= 20;

  // ---- Totales -------------------------------------------------------------
  ensureSpace(80);
  const totalsX = PAGE_W - MARGIN - 240;
  const valuesX = PAGE_W - MARGIN - 10;
  const rightText = (s: string, yPos: number, f: PDFFont, size = 10) => {
    const w = f.widthOfTextAtSize(s, size);
    text(s, valuesX - w, yPos, { font: f, size });
  };
  text("Total neto", totalsX, y, { size: 10, color: MUTED });
  rightText(fmtMoney(data.totalNeto, data.currency), y, font);
  y -= 15;
  text("IVA", totalsX, y, { size: 10, color: MUTED });
  rightText(fmtMoney(data.totalIva, data.currency), y, font);
  y -= 15;
  text("Total (USD ref.)", totalsX, y, { size: 10, color: MUTED });
  rightText(fmtMoney(data.totalNetoUsd, "USD"), y, font);
  y -= 16;
  hr(y);
  y -= 14;
  text("Total a pagar", totalsX, y, { font: bold, size: 11 });
  rightText(
    fmtMoney(data.totalNeto + data.totalIva, data.currency),
    y,
    bold,
    11,
  );

  // ---- Bloque de firma (con ancla DocuSign "/sn1/") ------------------------
  ensureSpace(150);
  y -= 60;
  hr(y);
  y -= 24;
  text(
    "El comprador acepta y firma electrónicamente el presente contrato:",
    MARGIN,
    y,
    { size: 10 },
  );
  y -= 50;
  // Ancla invisible-ish: DocuSign pone el tab signHere sobre este texto.
  text("/sn1/", MARGIN, y, { size: 10, color: rgb(1, 1, 1) });
  page.drawLine({
    start: { x: MARGIN, y: y - 4 },
    end: { x: MARGIN + 220, y: y - 4 },
    thickness: 0.75,
    color: INK,
  });
  y -= 16;
  text(data.signerName, MARGIN, y, { font: bold, size: 10 });
  y -= 12;
  text(data.clientName ?? "", MARGIN, y, { size: 9, color: MUTED });

  // ---- Pie -----------------------------------------------------------------
  text(
    "Documento generado por Hijuelas Growth — firma gestionada vía DocuSign.",
    MARGIN,
    MARGIN - 20,
    { size: 8, color: MUTED },
  );

  return pdf.save();
}
