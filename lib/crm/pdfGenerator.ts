import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage } from "pdf-lib";

// ─── Helpers ────────────────────────────────────────────────────────────────

function safeText(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val);
}

function money(val: unknown): string {
  const n = Number(val) || 0;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function drawHRule(
  page: PDFPage,
  x: number,
  y: number,
  width: number,
  thickness = 0.5
) {
  page.drawLine({
    start: { x, y },
    end: { x: x + width, y },
    thickness,
    color: rgb(0.8, 0.8, 0.8),
  });
}

function wrapText(text: string, maxChars: number): string[] {
  if (!text) return [];
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= maxChars) {
      current = (current + " " + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Status badge colour ─────────────────────────────────────────────────────

function statusColor(status: string) {
  switch (status) {
    case "Approved":
      return rgb(0.1, 0.6, 0.3);
    case "Sent":
      return rgb(0.1, 0.4, 0.8);
    case "Accepted":
      return rgb(0.05, 0.5, 0.2);
    case "Rejected":
      return rgb(0.7, 0.1, 0.1);
    case "Pending Approval":
      return rgb(0.7, 0.5, 0.0);
    default:
      return rgb(0.4, 0.4, 0.4);
  }
}

// ─── Main generator ─────────────────────────────────────────────────────────

export async function generateQuotePdf(
  quote: any,
  account: any,
  organization?: any
) {
  const pdfDoc = await PDFDocument.create();

  const regular = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const oblique = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

  const W = 595; // A4 width pt
  const H = 842; // A4 height pt
  const MARGIN = 45;
  const CONTENT_W = W - 2 * MARGIN;

  // Brand colours
  const PRIMARY = rgb(0.04, 0.28, 0.68); // deep blue
  const ACCENT = rgb(0.0, 0.55, 0.85);
  const LIGHT_BG = rgb(0.95, 0.97, 1.0);
  const DARK_TEXT = rgb(0.1, 0.1, 0.1);
  const MUTED = rgb(0.5, 0.5, 0.5);
  const WHITE = rgb(1, 1, 1);

  // Helper to add a fresh page
  function addPage(): { page: PDFPage; y: number } {
    const page = pdfDoc.addPage([W, H]);
    return { page, y: H - MARGIN };
  }

  let { page, y } = addPage();

  // ── Header bar ────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: H - 80, width: W, height: 80, color: PRIMARY });

  // Company / logo placeholder
  const companyName =
    (organization?.name || account?.company_name || "Aupulens ERP").toUpperCase();
  page.drawText(companyName, {
    x: MARGIN,
    y: H - 35,
    size: 18,
    font: bold,
    color: WHITE,
  });
  const tagline =
    (organization?.tagline || "Quote & Proposal").toUpperCase();
  page.drawText(tagline, {
    x: MARGIN,
    y: H - 55,
    size: 9,
    font: regular,
    color: rgb(0.75, 0.85, 1.0),
  });

  // Quote title (right side)
  page.drawText("QUOTE", {
    x: W - MARGIN - 60,
    y: H - 35,
    size: 22,
    font: bold,
    color: WHITE,
  });

  y = H - 100;

  // ── Quote meta row ────────────────────────────────────────────
  // Left: quote number, version, status
  page.drawText(`QUOTE #: ${safeText(quote.quote_number).toUpperCase()}`, {
    x: MARGIN,
    y,
    size: 10,
    font: bold,
    color: DARK_TEXT,
  });
  y -= 14;
  page.drawText(`VERSION: V${safeText(quote.version).toUpperCase()}`, {
    x: MARGIN,
    y,
    size: 9,
    font: regular,
    color: MUTED,
  });
  y -= 14;

  // Status badge
  const statusBg = statusColor(quote.status);
  const statusLabel = safeText(quote.status).toUpperCase();
  page.drawRectangle({ x: MARGIN, y: y - 4, width: 80, height: 14, color: statusBg });
  page.drawText(statusLabel, {
    x: MARGIN + 4,
    y: y - 1,
    size: 8,
    font: bold,
    color: WHITE,
  });
  y -= 20;

  // Right column: dates
  const colRight = W - MARGIN - 160;
  let yR = H - 100;
  page.drawText(
    `ISSUE DATE: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}`,
    { x: colRight, y: yR, size: 9, font: regular, color: DARK_TEXT }
  );
  yR -= 13;
  page.drawText(
    `VALID UNTIL: ${new Date(quote.validity_date).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }).toUpperCase()}`,
    { x: colRight, y: yR, size: 9, font: regular, color: DARK_TEXT }
  );
  if (quote.sent_at) {
    yR -= 13;
    page.drawText(
      `SENT ON: ${new Date(quote.sent_at).toLocaleDateString().toUpperCase()}`,
      { x: colRight, y: yR, size: 9, font: regular, color: MUTED }
    );
  }

  y = Math.min(y, yR) - 15;
  drawHRule(page, MARGIN, y, CONTENT_W);
  y -= 18;

  // ── From / To block ──────────────────────────────────────────
  const halfW = CONTENT_W / 2 - 10;
  
  const yStartFromTo = y;

  // FROM: company
  page.drawText("FROM", { x: MARGIN, y, size: 8, font: bold, color: ACCENT });
  y -= 14;
  page.drawText(companyName, { x: MARGIN, y, size: 10, font: bold, color: DARK_TEXT });
  if (organization?.address) {
    y -= 13;
    page.drawText(safeText(organization.address).toUpperCase(), { x: MARGIN, y, size: 9, font: regular, color: MUTED });
  }
  if (organization?.phone) {
    y -= 13;
    page.drawText(safeText(organization.phone).toUpperCase(), { x: MARGIN, y, size: 9, font: regular, color: MUTED });
  }
  if (organization?.email) {
    y -= 13;
    page.drawText(safeText(organization.email).toUpperCase(), { x: MARGIN, y, size: 9, font: regular, color: MUTED });
  }

  // TO: customer
  const toX = MARGIN + halfW + 20;
  let yTo = yStartFromTo;
  
  page.drawText("BILL TO", { x: toX, y: yTo, size: 8, font: bold, color: ACCENT });
  yTo -= 14;
  page.drawText(safeText(account?.company_name || "Customer").toUpperCase(), {
    x: toX, y: yTo, size: 10, font: bold, color: DARK_TEXT,
  });
  if (account?.billing_address) {
    yTo -= 13;
    page.drawText(safeText(account.billing_address), { x: toX, y: yTo, size: 9, font: regular, color: MUTED });
  }
  if (account?.phone) {
    yTo -= 13;
    page.drawText(safeText(account.phone), { x: toX, y: yTo, size: 9, font: regular, color: MUTED });
  }
  if (account?.email) {
    yTo -= 13;
    page.drawText(safeText(account.email), { x: toX, y: yTo, size: 9, font: regular, color: MUTED });
  }

  y = Math.min(y, yTo) - 20;
  drawHRule(page, MARGIN, y, CONTENT_W);
  y -= 18;

  // ── Line Items Table ─────────────────────────────────────────
  // Column config (x offset from MARGIN, width)
  type ColDef = { label: string; x: number; w: number; right?: boolean };
  const cols: ColDef[] = [
    { label: "DESCRIPTION", x: 0, w: 190 },
    { label: "QTY", x: 195, w: 40, right: true },
    { label: "UNIT PRICE", x: 240, w: 65, right: true },
    { label: "DISCOUNT", x: 310, w: 60, right: true },
    { label: "TAX", x: 375, w: 45, right: true },
    { label: "LINE TOTAL", x: 425, w: 75, right: true }, // Max 500
  ];

  // Table header
  page.drawRectangle({
    x: MARGIN,
    y: y - 4,
    width: CONTENT_W,
    height: 18,
    color: PRIMARY,
  });

  for (const col of cols) {
    page.drawText(col.label.toUpperCase(), {
      x: MARGIN + col.x + (col.right ? col.w - regular.widthOfTextAtSize(col.label.toUpperCase(), 8.5) : 2),
      y: y + 2,
      size: 8.5,
      font: bold,
      color: WHITE,
    });
  }
  y -= 22;

  // Line items
  const lineItems: any[] = quote.line_items || [];
  let rowAlt = false;

  for (const item of lineItems) {
    const lineBase = (item.quantity || 0) * (item.unit_price || 0);
    const disc = lineBase * ((item.discount_percent || 0) / 100);
    const afterDisc = lineBase - disc;
    const tax = afterDisc * ((item.tax_percent || 0) / 100);
    const lineTotal = afterDisc + tax;

  // Row background
    if (rowAlt) {
      page.drawRectangle({ x: MARGIN, y: y - 4, width: CONTENT_W, height: 18, color: LIGHT_BG });
    }
    rowAlt = !rowAlt;

    const itemName = safeText(item.item_name).toUpperCase();
    const desc = safeText(item.description).toUpperCase();
    const displayName = desc ? `${itemName} — ${desc}` : itemName;
    // Truncate long names
    const truncated = displayName.length > 38 ? displayName.slice(0, 36) + "…" : displayName;

    page.drawText(truncated, { x: MARGIN + 2, y: y, size: 8.5, font: regular, color: DARK_TEXT });

    const cells = [
      { col: cols[1], val: safeText(item.quantity) },
      { col: cols[2], val: money(item.unit_price) },
      { col: cols[3], val: disc > 0 ? `-${money(disc)}` : "—" },
      { col: cols[4], val: tax > 0 ? `+${money(tax)}` : "—" },
      { col: cols[5], val: money(lineTotal) },
    ];

    for (const cell of cells) {
      const tw = regular.widthOfTextAtSize(cell.val, 8.5);
      page.drawText(cell.val, {
        x: MARGIN + cell.col.x + cell.col.w - tw,
        y,
        size: 8.5,
        font: regular,
        color: DARK_TEXT,
      });
    }

    y -= 20;

    // Page overflow guard
    if (y < 120) {
      page = pdfDoc.addPage([W, H]).setMediaBox(0, 0, W, H) as any;
      // Actually use addPage properly:
      const np = pdfDoc.addPage([W, H]);
      page = np;
      y = H - MARGIN;
    }
  }

  drawHRule(page, MARGIN, y, CONTENT_W);
  y -= 18;

  // ── Totals block ─────────────────────────────────────────────
  const totX = MARGIN + CONTENT_W - 200;

  const drawTotalRow = (
    label: string,
    value: string,
    isBold = false,
    clr = DARK_TEXT
  ) => {
    const font = isBold ? bold : regular;
    const sz = isBold ? 11 : 9;
    page.drawText(label.toUpperCase(), { x: totX, y, size: sz, font, color: clr });
    const vw = font.widthOfTextAtSize(value, sz);
    page.drawText(value, { x: MARGIN + CONTENT_W - vw, y, size: sz, font, color: clr });
    y -= isBold ? 18 : 14;
  };

  const subtotal =
    lineItems.reduce((acc, item) => acc + (item.quantity || 0) * (item.unit_price || 0), 0);

  drawTotalRow("SUBTOTAL:", money(subtotal));
  drawTotalRow(
    `DISCOUNT (AVG ${lineItems.length > 0 ? ((lineItems.reduce((a, i) => a + (i.discount_percent || 0), 0) / lineItems.length)).toFixed(1) : "0"}%):`,
    `-${money(quote.discount_total || 0)}`,
    false,
    rgb(0.6, 0.1, 0.1)
  );
  drawTotalRow("TAX:", `+${money(quote.tax_total || 0)}`, false, rgb(0.5, 0.4, 0.0));

  // Grand total bar
  y -= 20; // Explicit 20-point absolute margin so it mathematically cannot collide
  page.drawRectangle({ x: totX - 5, y: y - 5, width: 200 + 10, height: 22, color: PRIMARY }); // Widened by 5 points
  page.drawText("GRAND TOTAL:", { x: totX, y: y + 3, size: 11, font: bold, color: WHITE });
  const gtW = bold.widthOfTextAtSize(money(quote.grand_total || 0), 12);
  page.drawText(money(quote.grand_total || 0), {
    x: MARGIN + CONTENT_W - gtW - 5, // Moved text left by 5 points for padding
    y: y + 3,
    size: 12,
    font: bold,
    color: WHITE,
  });
  y -= 30;

  // ── Notes ─────────────────────────────────────────────────────
  if (quote.notes) {
    y -= 10;
    page.drawText("NOTES:", { x: MARGIN, y, size: 9, font: bold, color: DARK_TEXT });
    y -= 13;
    const noteLines = wrapText(safeText(quote.notes), 90);
    for (const line of noteLines) {
      page.drawText(line, { x: MARGIN, y, size: 8.5, font: oblique, color: MUTED });
      y -= 12;
    }
  }

  // ── Terms & Conditions ────────────────────────────────────────
  if (quote.terms_and_conditions) {
    y -= 10;
    drawHRule(page, MARGIN, y, CONTENT_W);
    y -= 15;
    page.drawText("TERMS & CONDITIONS", { x: MARGIN, y, size: 10, font: bold, color: PRIMARY });
    y -= 14;
    const termLines = wrapText(safeText(quote.terms_and_conditions), 95);
    for (const line of termLines) {
      page.drawText(line, { x: MARGIN, y, size: 8, font: regular, color: DARK_TEXT });
      y -= 11;
      if (y < 100) {
        const np = pdfDoc.addPage([W, H]);
        page = np as any;
        y = H - MARGIN;
      }
    }
  }

  // ── Signature block ───────────────────────────────────────────
  if (y < 140) {
    const np = pdfDoc.addPage([W, H]);
    page = np as any;
    y = H - MARGIN;
  }

  y -= 20;
  drawHRule(page, MARGIN, y, CONTENT_W);
  y -= 25;

  // Two signature columns
  const sigWidth = (CONTENT_W - 40) / 2;

  page.drawText("Authorized Signature (Vendor)", {
    x: MARGIN, y, size: 9, font: bold, color: DARK_TEXT,
  });
  page.drawText("Accepted By (Customer)", {
    x: MARGIN + sigWidth + 40, y, size: 9, font: bold, color: DARK_TEXT,
  });

  y -= 40;
  // Signature lines
  drawHRule(page, MARGIN, y, sigWidth, 1);
  drawHRule(page, MARGIN + sigWidth + 40, y, sigWidth, 1);
  y -= 14;

  page.drawText("Name: ___________________________", {
    x: MARGIN, y, size: 8.5, font: regular, color: MUTED,
  });
  page.drawText("Name: ___________________________", {
    x: MARGIN + sigWidth + 40, y, size: 8.5, font: regular, color: MUTED,
  });
  y -= 13;
  page.drawText("Title: ___________________________", {
    x: MARGIN, y, size: 8.5, font: regular, color: MUTED,
  });
  page.drawText("Title: ___________________________", {
    x: MARGIN + sigWidth + 40, y, size: 8.5, font: regular, color: MUTED,
  });
  y -= 13;
  page.drawText("Date:  ___________________________", {
    x: MARGIN, y, size: 8.5, font: regular, color: MUTED,
  });
  page.drawText("Date:  ___________________________", {
    x: MARGIN + sigWidth + 40, y, size: 8.5, font: regular, color: MUTED,
  });

  // ── Footer ───────────────────────────────────────────────────
  const lastPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
  lastPage.drawText(
    `This quote is valid until ${new Date(quote.validity_date).toLocaleDateString()}. Generated by Aupulens ERP.`,
    { x: MARGIN, y: 25, size: 7, font: regular, color: MUTED }
  );
  lastPage.drawText(
    `Page ${pdfDoc.getPageCount()} of ${pdfDoc.getPageCount()}`,
    { x: W - MARGIN - 60, y: 25, size: 7, font: regular, color: MUTED }
  );

  return pdfDoc.save();
}
