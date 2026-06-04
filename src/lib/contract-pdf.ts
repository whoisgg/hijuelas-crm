import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFFont,
  type PDFPage,
} from "pdf-lib";

import {
  CLAUSE_ENTREGA,
  CLAUSE_GARANTIA,
  TAIL_CLAUSES,
  type SellerLegalProfile,
} from "@/lib/contract-templates/frambuesa-legal";

/**
 * Genera el PDF del Contrato de Compraventa de Plantas con los términos legales
 * (módulo frambuesa-legal.ts) + los datos del contrato del CRM. Reemplaza el PDF
 * provisional anterior. Incluye anclas de firma "/sn1/" (comprador) y "/sn2/"
 * (vendedor) para los tabs signHere de DocuSign.
 *
 * ⚠️ El texto legal proviene de un scan transcrito — ver frambuesa-legal.ts.
 */

export type ContractPdfItem = {
  species_name: string | null;
  variety_name: string | null;
  qty_plants: number;
  unit_price: number;
  currency: string;
  delivery_year: number | null;
  delivery_week: number | null;
};

export type ContractPdfPayment = {
  label: string; // ej. "1ª cuota (50%)" o tipo
  dueDate: string | null; // ISO date
  amount: number;
  currency: string;
};

export type ContractPdfData = {
  number: string;
  placeAndDate: string; // ej. "Santiago, 10 de marzo de 2026"
  seller: SellerLegalProfile;
  buyer: {
    legalName: string;
    taxId: string | null;
    giro: string | null;
    domicile: string | null;
    representativeName: string | null;
    representativeId: string | null; // cédula (puede faltar)
    noticeEmail: string | null;
  };
  plantingLocation: string | null; // cláusula 1.2 (puede faltar en CRM)
  currency: string;
  totalNeto: number;
  totalIva: number;
  totalNetoUsd: number;
  items: ContractPdfItem[];
  payments: ContractPdfPayment[];
};

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MX = 56; // margen lateral
const MT = 56; // margen superior
const MB = 64; // margen inferior
const INK = rgb(0.12, 0.12, 0.13);
const MUTED = rgb(0.42, 0.45, 0.46);
const LINE = rgb(0.8, 0.82, 0.84);
const ACCENT = rgb(0.05, 0.42, 0.28);
const BLANK = "______________________";

/**
 * Sanitiza texto a caracteres encodables por Helvetica/WinAnsi. pdf-lib LANZA si
 * un carácter no es encodable (ej. comillas tipográficas, em-dash, emoji que
 * pudieran venir en datos del CRM). Mapea los comunes y descarta el resto.
 */
function sanitize(s: string): string {
  return (s ?? "")
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„‟]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/ /g, " ")
    .replace(/[^\x09\x0A\x0D\x20-\xFF]/g, "");
}

function money(n: number, currency: string): string {
  const v = Number(n || 0).toLocaleString("es-CL", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} ${v}`;
}
function int(n: number): string {
  return Number(n || 0).toLocaleString("es-CL");
}
function dateEs(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("es-CL", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

export async function generateContractPdf(
  data: ContractPdfData,
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const contentW = PAGE_W - MX * 2;

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MT;
  let pageNo = 1;

  const footer = (p: PDFPage, n: number) => {
    p.drawText(sanitize(`Contrato ${data.number}`), {
      x: MX,
      y: MB - 28,
      size: 7,
      font,
      color: MUTED,
    });
    const pg = `Página ${n}`;
    p.drawText(pg, {
      x: PAGE_W - MX - font.widthOfTextAtSize(pg, 7),
      y: MB - 28,
      size: 7,
      font,
      color: MUTED,
    });
  };

  const newPage = () => {
    footer(page, pageNo);
    page = pdf.addPage([PAGE_W, PAGE_H]);
    pageNo += 1;
    y = PAGE_H - MT;
  };

  const need = (h: number) => {
    if (y - h < MB) newPage();
  };

  // word-wrap a un ancho dado
  const wrap = (
    text: string,
    f: PDFFont,
    size: number,
    maxW: number,
  ): string[] => {
    const words = sanitize(text).split(/\s+/);
    const lines: string[] = [];
    let cur = "";
    for (const w of words) {
      const test = cur ? `${cur} ${w}` : w;
      if (f.widthOfTextAtSize(test, size) > maxW && cur) {
        lines.push(cur);
        cur = w;
      } else {
        cur = test;
      }
    }
    if (cur) lines.push(cur);
    return lines;
  };

  const para = (
    text: string,
    opts: {
      f?: PDFFont;
      size?: number;
      color?: typeof INK;
      gap?: number;
      lh?: number;
      indent?: number;
    } = {},
  ) => {
    const f = opts.f ?? font;
    const size = opts.size ?? 9.5;
    const lh = opts.lh ?? size + 3.5;
    const x = MX + (opts.indent ?? 0);
    const lines = wrap(text, f, size, contentW - (opts.indent ?? 0));
    for (const ln of lines) {
      need(lh);
      page.drawText(ln, { x, y: y - size, size, font: f, color: opts.color ?? INK });
      y -= lh;
    }
    y -= opts.gap ?? 6;
  };

  const heading = (text: string) => {
    need(26);
    y -= 6;
    page.drawText(sanitize(text), { x: MX, y: y - 11, size: 10.5, font: bold, color: INK });
    y -= 18;
  };

  const hr = () => {
    need(8);
    page.drawLine({
      start: { x: MX, y },
      end: { x: PAGE_W - MX, y },
      thickness: 0.6,
      color: LINE,
    });
    y -= 8;
  };

  // tabla genérica: headers + filas, anchos relativos
  const table = (
    headers: string[],
    rows: string[][],
    widths: number[], // fracciones que suman ~1
  ) => {
    const colX: number[] = [];
    let acc = MX;
    for (const w of widths) {
      colX.push(acc);
      acc += w * contentW;
    }
    const rowH = 14;
    need(rowH + 4);
    // header
    headers.forEach((h, i) => {
      page.drawText(h, { x: colX[i], y: y - 9, size: 8, font: bold, color: INK });
    });
    y -= rowH;
    page.drawLine({
      start: { x: MX, y: y + 4 },
      end: { x: PAGE_W - MX, y: y + 4 },
      thickness: 0.6,
      color: LINE,
    });
    // rows (con wrapping por celda)
    for (const r of rows) {
      const cellLines = r.map((c, i) =>
        wrap(c ?? "", font, 8.5, widths[i] * contentW - 6),
      );
      const linesN = Math.max(1, ...cellLines.map((l) => l.length));
      const h = linesN * 11 + 3;
      need(h);
      cellLines.forEach((lines, i) => {
        lines.forEach((ln, k) => {
          page.drawText(ln, {
            x: colX[i],
            y: y - 9 - k * 11,
            size: 8.5,
            font,
            color: INK,
          });
        });
      });
      y -= h;
    }
    y -= 6;
  };

  const clause = (c: { heading: string; paragraphs: string[] }) => {
    heading(c.heading);
    for (const p of c.paragraphs) para(p);
  };

  // ---- TÍTULO ----
  const title = "CONTRATO DE COMPRAVENTA DE PLANTAS";
  page.drawText(title, {
    x: MX + (contentW - bold.widthOfTextAtSize(title, 13)) / 2,
    y: y - 13,
    size: 13,
    font: bold,
    color: ACCENT,
  });
  y -= 22;
  const sub = sanitize(`${data.seller.legalName}  ·  Contrato N° ${data.number}`);
  page.drawText(sub, {
    x: MX + (contentW - font.widthOfTextAtSize(sub, 9)) / 2,
    y: y - 9,
    size: 9,
    font,
    color: MUTED,
  });
  y -= 24;
  hr();

  // ---- COMPARECENCIA (preámbulo) ----
  const buyerRep = data.buyer.representativeName ?? BLANK;
  const buyerRepId = data.buyer.representativeId ?? BLANK;
  const buyerDom = data.buyer.domicile ?? BLANK;
  para(
    `En ${data.placeAndDate}, entre ${data.seller.legalName}, RUT ${data.seller.taxId}, representada por don ${data.seller.representativeName}, cédula de identidad número ${data.seller.representativeId}, ambos domiciliados en ${data.seller.domicile}, en adelante e indistintamente "VIVEROS HIJUELAS"; y por la otra parte, ${data.buyer.legalName}, RUT ${data.buyer.taxId ?? BLANK}, representada por ${buyerRep}, cédula de identidad número ${buyerRepId}, domiciliada en ${buyerDom}, en adelante e indistintamente el "COMPRADOR"; se ha convenido el siguiente contrato de compraventa de plantas:`,
    { gap: 10 },
  );

  // ---- PRIMERO: Objeto ----
  heading("PRIMERO: Objeto del contrato.");
  para(
    'Por el presente instrumento, VIVEROS HIJUELAS vende, cede y transfiere al COMPRADOR, quien compra, acepta y adquiere para sí, las plantas de las especies y variedades que se individualizan en el siguiente cuadro, en adelante "las Plantas":',
  );
  table(
    ["N° de plantas", "Especie", "Variedad"],
    data.items.map((it) => [
      int(it.qty_plants),
      it.species_name ?? "—",
      it.variety_name ?? "—",
    ]),
    [0.3, 0.35, 0.35],
  );
  para(
    `1.2. Las Plantas objeto de este contrato, una vez entregadas al COMPRADOR, serán plantadas en la propiedad ubicada en ${data.plantingLocation ?? BLANK}.`,
  );
  para(
    "1.3. La firma del presente contrato y la aceptación de sus condiciones es requisito esencial y previo para la realización de cualquier entrega de plantas objeto de este instrumento.",
    { gap: 8 },
  );

  // ---- SEGUNDO: Entrega (tabla 2.1 + prose) ----
  heading("SEGUNDO: Condiciones de la entrega material.");
  para(
    "2.1. Variedad, cantidad y fecha de entrega. El COMPRADOR compra y VIVEROS HIJUELAS vende las Plantas que se individualizan en el siguiente cuadro, las que serán entregadas según la semana y año indicados:",
  );
  table(
    ["Especie", "Variedad", "Cantidad", "Semana / Año entrega"],
    data.items.map((it) => [
      it.species_name ?? "—",
      it.variety_name ?? "—",
      int(it.qty_plants),
      it.delivery_week && it.delivery_year
        ? `Sem ${it.delivery_week} / ${it.delivery_year}`
        : it.delivery_year
          ? String(it.delivery_year)
          : "—",
    ]),
    [0.27, 0.3, 0.2, 0.23],
  );
  for (const p of CLAUSE_ENTREGA.paragraphs) para(p);

  // ---- TERCERO: Garantía ----
  clause(CLAUSE_GARANTIA);

  // ---- CUARTO: Precio, forma de pago ----
  heading("CUARTO: Precio, forma de pago, monto y garantía de pago.");
  para(
    "4.1. Precio. El precio de la compraventa, que el COMPRADOR pagará a VIVEROS HIJUELAS por las Plantas, es el que se indica en el siguiente cuadro:",
  );
  table(
    ["Especie", "Variedad", "Cantidad", "Valor unitario", "Total neto"],
    data.items.map((it) => [
      it.species_name ?? "—",
      it.variety_name ?? "—",
      int(it.qty_plants),
      money(it.unit_price, it.currency),
      money(it.qty_plants * it.unit_price, it.currency),
    ]),
    [0.22, 0.25, 0.16, 0.18, 0.19],
  );
  para(
    `Valor total neto: ${money(data.totalNeto, data.currency)}   ·   IVA: ${money(
      data.totalIva,
      data.currency,
    )}   ·   Total: ${money(data.totalNeto + data.totalIva, data.currency)}   (ref. USD ${money(
      data.totalNetoUsd,
      "USD",
    ).replace("USD ", "")}).`,
    { f: bold, size: 9 },
  );

  para("4.3. Forma de pago de las Plantas. El precio se pagará conforme al siguiente calendario:");
  if (data.payments.length) {
    table(
      ["Cuota", "Vencimiento", "Monto"],
      data.payments.map((p) => [p.label, dateEs(p.dueDate), money(p.amount, p.currency)]),
      [0.4, 0.3, 0.3],
    );
  } else {
    para(
      "50% del Valor Total Neto al contado antes de la primera entrega, y el 50% restante conforme se acuerde entre las partes.",
      { indent: 12 },
    );
  }
  para(
    `4.3.3. Las partes convienen en que el pago se realice en la cuenta corriente que VIVEROS HIJUELAS mantiene en: ${data.seller.bankName}, cuenta corriente N° ${data.seller.bankAccount}, a nombre de ${data.seller.legalName}, RUT ${data.seller.taxId}.`,
  );
  para(
    "4.4. Moneda y Tasa de Interés. Las partes acuerdan realizar la transacción referida a la compraventa de plantas en moneda nacional. Para los efectos de la convertibilidad de la moneda, las partes acuerdan utilizar los valores señalados precedentemente, acordando como tal el valor del dólar observado del día de la respectiva facturación.",
    { gap: 8 },
  );

  // ---- QUINTO en adelante (boilerplate) ----
  for (const c of TAIL_CLAUSES) clause(c);

  // ---- OCTAVO: Avisos ----
  heading("OCTAVO: Avisos.");
  para(
    `Las partes convienen en que todo aviso, notificación o comunicación entre ellas en relación con el presente contrato deberá efectuarse por escrito y se entenderá válidamente practicada en los siguientes domicilios y correos electrónicos:`,
  );
  para(
    `8.1. A VIVEROS HIJUELAS: atención ${data.seller.noticeName}, ${data.seller.noticeAddress}, correo electrónico ${data.seller.noticeEmail}.`,
    { indent: 12 },
  );
  para(
    `8.2. Al COMPRADOR: ${data.buyer.legalName}, correo electrónico ${data.buyer.noticeEmail ?? BLANK}.`,
    { indent: 12, gap: 8 },
  );

  // ---- NOVENO ----
  heading("NOVENO: Domicilio.");
  para(
    "Para todos los efectos legales derivados del presente contrato, las partes fijan su domicilio en la ciudad y comuna de Santiago, y se someten a la competencia de sus tribunales.",
    { gap: 8 },
  );

  // ---- DÉCIMO TERCERO: Ejemplares ----
  heading("DÉCIMO TERCERO: Ejemplares.");
  para(
    "El presente instrumento se extiende y firma en dos ejemplares de idéntico tenor y fecha, quedando uno en poder de cada parte.",
    { gap: 16 },
  );

  // ---- FIRMAS (anclas DocuSign) ----
  need(150);
  hr();
  y -= 14;
  const colW = contentW / 2;
  const leftX = MX;
  const rightX = MX + colW + 16;
  const sigBaseY = y - 46;

  // anclas (texto casi invisible: blanco). DocuSign pone el tab sobre el ancla.
  page.drawText("/sn1/", { x: leftX, y: sigBaseY + 6, size: 9, font, color: rgb(1, 1, 1) });
  page.drawText("/sn2/", { x: rightX, y: sigBaseY + 6, size: 9, font, color: rgb(1, 1, 1) });

  page.drawLine({
    start: { x: leftX, y: sigBaseY },
    end: { x: leftX + colW - 24, y: sigBaseY },
    thickness: 0.6,
    color: INK,
  });
  page.drawLine({
    start: { x: rightX, y: sigBaseY },
    end: { x: rightX + colW - 24, y: sigBaseY },
    thickness: 0.6,
    color: INK,
  });
  y = sigBaseY - 14;
  page.drawText(sanitize(buyerRep === BLANK ? "Comprador" : buyerRep), {
    x: leftX,
    y,
    size: 9,
    font: bold,
    color: INK,
  });
  page.drawText(sanitize(data.seller.representativeName), { x: rightX, y, size: 9, font: bold, color: INK });
  y -= 12;
  page.drawText(sanitize(`p.p. ${data.buyer.legalName}`), { x: leftX, y, size: 8, font, color: MUTED });
  page.drawText(sanitize(`p.p. ${data.seller.legalName}`), { x: rightX, y, size: 8, font, color: MUTED });

  footer(page, pageNo);
  return pdf.save();
}
