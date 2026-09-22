import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";

// Client-side PDF builder for the Sales > Export Docs page (Bill of Lading,
// Commercial Invoice, Packing List). Standard PDF fonts can't render the ₹
// glyph, so amounts are written as "INR 1,234.00".

export interface ExportDocOrder {
  orderNumber: string;
  customer: string;
  customerEmail?: string;
  shippingAddress?: string;
  createdAt: string;
  items: { description: string; quantity: number; price: number; amount: number }[];
  subtotal: number;
  taxAmount: number;
  total: number;
}

export type ExportDocType = "bill-of-lading" | "commercial-invoice" | "packing-list";

const inr = (n: number) =>
  `INR ${(Number(n) || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Strips characters the standard fonts can't encode (e.g. Devanagari) so PDF
// generation never throws on unusual customer names.
const safe = (s: string) => (s || "").replace(/[^\x20-\x7E -ÿ]/g, "?");

interface Col {
  title: string;
  width: number;
  align?: "left" | "right";
  value: (row: any, i: number) => string;
}

export async function buildExportDocPdf(type: ExportDocType, order: ExportDocOrder, seller = "Aupulens Enterprises"): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const W = 595;
  const H = 842;
  const M = 40;
  let page: PDFPage = pdf.addPage([W, H]);
  let y = H - M;

  const text = (t: string, x: number, size = 10, f: PDFFont = font, color = rgb(0.1, 0.1, 0.1)) =>
    page.drawText(safe(t), { x, y, size, font: f, color });
  const rightText = (t: string, xRight: number, size = 10, f: PDFFont = font) => {
    const s = safe(t);
    page.drawText(s, { x: xRight - f.widthOfTextAtSize(s, size), y, size, font: f, color: rgb(0.1, 0.1, 0.1) });
  };
  const ensure = (need: number) => {
    if (y - need < M) {
      page = pdf.addPage([W, H]);
      y = H - M;
    }
  };

  const titles: Record<ExportDocType, string> = {
    "bill-of-lading": "BILL OF LADING",
    "commercial-invoice": "COMMERCIAL INVOICE",
    "packing-list": "PACKING LIST",
  };
  const prefix: Record<ExportDocType, string> = { "bill-of-lading": "BL", "commercial-invoice": "CI", "packing-list": "PL" };

  text(titles[type], M, 20, bold);
  y -= 22;
  text(`${prefix[type]}-${order.orderNumber}`, M, 11, font, rgb(0.35, 0.35, 0.35));
  rightText(`Date: ${new Date().toLocaleDateString("en-GB")}`, W - M);
  y -= 10;
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.2, 0.2, 0.2) });
  y -= 24;

  const label = type === "bill-of-lading" || type === "packing-list" ? "Consignee" : "Buyer";
  text("Shipper / Seller", M, 9, bold);
  text(label, W / 2, 9, bold);
  y -= 14;
  text(seller, M, 10);
  text(order.customer, W / 2, 10);
  y -= 13;
  if (order.shippingAddress) {
    const lines = safe(order.shippingAddress).match(/.{1,45}(\s|$)/g) || [];
    for (const l of lines.slice(0, 4)) {
      text(l.trim(), W / 2, 9, font, rgb(0.35, 0.35, 0.35));
      y -= 12;
    }
  }
  if (order.customerEmail) {
    text(order.customerEmail, W / 2, 9, font, rgb(0.35, 0.35, 0.35));
    y -= 12;
  }
  text(`Order reference: ${order.orderNumber}`, M, 9, font, rgb(0.35, 0.35, 0.35));
  y -= 26;

  let cols: Col[];
  if (type === "commercial-invoice") {
    cols = [
      { title: "#", width: 25, value: (_r, i) => String(i + 1) },
      { title: "Description", width: 235, value: (r) => r.description },
      { title: "Qty", width: 55, align: "right", value: (r) => String(r.quantity) },
      { title: "Unit price", width: 95, align: "right", value: (r) => inr(r.price) },
      { title: "Amount", width: 105, align: "right", value: (r) => inr(r.amount) },
    ];
  } else if (type === "packing-list") {
    cols = [
      { title: "Pkg", width: 40, value: (_r, i) => `PKG-${i + 1}` },
      { title: "Description", width: 265, value: (r) => r.description },
      { title: "Qty", width: 60, align: "right", value: (r) => String(r.quantity) },
      { title: "Weight", width: 95, value: () => "____________" },
      { title: "Dimensions", width: 95, value: () => "____________" },
    ];
  } else {
    cols = [
      { title: "#", width: 25, value: (_r, i) => String(i + 1) },
      { title: "Description of goods", width: 330, value: (r) => r.description },
      { title: "Qty", width: 60, align: "right", value: (r) => String(r.quantity) },
      { title: "Gross weight", width: 100, value: () => "____________" },
    ];
  }

  const drawHeader = () => {
    page.drawRectangle({ x: M, y: y - 5, width: W - 2 * M, height: 18, color: rgb(0.93, 0.93, 0.93) });
    let x = M + 4;
    for (const c of cols) {
      if (c.align === "right") rightText(c.title, x + c.width - 8, 9, bold);
      else text(c.title, x, 9, bold);
      x += c.width;
    }
    y -= 20;
  };
  drawHeader();

  order.items.forEach((item, i) => {
    ensure(20);
    if (y > H - M - 5) drawHeader();
    let x = M + 4;
    for (const c of cols) {
      let v = safe(c.value(item, i));
      const max = c.width - 10;
      while (v.length > 1 && font.widthOfTextAtSize(v, 9) > max) v = v.slice(0, -2) + ".";
      if (c.align === "right") rightText(v, x + c.width - 8, 9);
      else text(v, x, 9);
      x += c.width;
    }
    y -= 16;
    page.drawLine({ start: { x: M, y: y + 10 }, end: { x: W - M, y: y + 10 }, thickness: 0.3, color: rgb(0.8, 0.8, 0.8) });
  });

  y -= 10;
  ensure(90);
  if (type === "commercial-invoice") {
    const xr = W - M - 8;
    rightText(`Subtotal: ${inr(order.subtotal)}`, xr);
    y -= 14;
    rightText(`Tax: ${inr(order.taxAmount)}`, xr);
    y -= 16;
    rightText(`Total: ${inr(order.total)}`, xr, 12, bold);
    y -= 26;
    text("Payment terms: Net 30", M, 9, font, rgb(0.35, 0.35, 0.35));
  } else {
    const qty = order.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    text(`Total packages: ${order.items.length}    Total quantity: ${qty}`, M, 10, bold);
  }
  y -= 40;
  ensure(40);
  text("Authorised signatory", W - M - 130, 9, font, rgb(0.35, 0.35, 0.35));
  page.drawLine({ start: { x: W - M - 150, y: y + 14 }, end: { x: W - M, y: y + 14 }, thickness: 0.5, color: rgb(0.3, 0.3, 0.3) });

  return pdf.save();
}
