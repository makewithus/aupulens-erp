import type { ComputedLine, HsnSummaryRow } from "@/lib/sales/invoiceMath";
import type { TemplateDefinition, TemplateRenderContext } from "./types";
import { escapeHtml, fmtNum, money, dateStr } from "./helpers";

const FONT_STACK: Record<string, string> = {
  sans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  serif: "'Merriweather', 'Georgia', serif",
  mono: "'Roboto Mono', monospace",
};

// ============================================================
// PART 1 — shared, reusable building blocks. Every template composes
// these; none of them hard-code a full layout, so each template function
// below can arrange them very differently while staying visually
// consistent (spacing units, type scale, number formatting).
// ============================================================

interface Density {
  pad: string;
  fontSize: string;
  headFontSize: string;
  gap: string;
}
const NORMAL_DENSITY: Density = { pad: "10px 12px", fontSize: "12.5px", headFontSize: "10.5px", gap: "20px" };
const COMPACT_DENSITY: Density = { pad: "5px 8px", fontSize: "11px", headFontSize: "9.5px", gap: "10px" };

function amountPayable(ctx: TemplateRenderContext): { paid: number; payable: number } {
  const paid = (ctx.invoice.payments || []).reduce((acc, p) => acc + (Number(p.amount) || 0), 0);
  return { paid, payable: Math.max(0, ctx.totals.totalAmount - paid) };
}

function logoImg(ctx: TemplateRenderContext, maxHeight = 56): string {
  if (!ctx.settings.showImages || !ctx.company.logo) return "";
  return `<img src="${escapeHtml(ctx.company.logo)}" alt="logo" style="max-height:${maxHeight}px;max-width:180px;object-fit:contain;" />`;
}

// Long user text (names, addresses) must wrap safely rather than overflow
// or get clipped; short numeric/label values must never wrap mid-token.
const WRAP_SAFE = "overflow-wrap:break-word; word-break:break-word;";
const NOWRAP = "white-space:nowrap;";

/** Seller identity block: name, GSTIN, address — the one place this data is rendered, so it can never silently go missing. */
function sellerBlock(ctx: TemplateRenderContext, opts: { align?: "left" | "center"; nameSize?: number } = {}): string {
  const { company, settings } = ctx;
  const align = opts.align || "left";
  const nameSize = opts.nameSize ?? 20;
  return `
    <div style="text-align:${align}; min-width:0; max-width:100%;">
      <div style="font-size:${nameSize}px; font-weight:800; color:#111827; ${WRAP_SAFE}">${escapeHtml(company.name)}</div>
      ${settings.showCompanyDetails && company.gstin ? `<div style="font-size:11.5px; color:#4b5563; margin-top:3px; ${WRAP_SAFE}">GSTIN: ${escapeHtml(company.gstin)}</div>` : ""}
      ${settings.showCompanyDetails && company.address ? `<div style="font-size:11.5px; color:#6b7280; margin-top:2px; max-width:320px; ${WRAP_SAFE}">${escapeHtml(company.address)}</div>` : ""}
    </div>`;
}

function titleBlock(ctx: TemplateRenderContext, accent: string, opts: { align?: "left" | "right"; showOriginal?: boolean } = {}): string {
  const align = opts.align || "right";
  const titleWord = ctx.documentType === "purchase" ? "PURCHASE BILL" : ctx.documentType === "quotation" ? "QUOTATION" : "TAX INVOICE";
  return `
    <div style="text-align:${align}; min-width:0; max-width:100%;">
      <div style="font-size:24px; font-weight:800; letter-spacing:1px; color:${accent}; white-space:nowrap;">${titleWord}</div>
      ${opts.showOriginal ? `<div style="font-size:9.5px; letter-spacing:1.5px; text-transform:uppercase; color:#9ca3af; margin-top:2px; white-space:nowrap;">Original for Recipient</div>` : ""}
      <div style="font-size:12px; color:#4b5563; margin-top:6px; font-weight:600; ${WRAP_SAFE}"># ${escapeHtml(ctx.invoice.number)}</div>
    </div>`;
}

function metaRows(ctx: TemplateRenderContext): { label: string; value: string }[] {
  const { invoice, settings } = ctx;
  return [
    { label: ctx.documentType === "quotation" ? "Quotation Date" : "Invoice Date", value: dateStr(invoice.invoiceDate) },
    settings.showDueDate ? { label: "Due Date", value: dateStr(invoice.dueDate) } : null,
    { label: "Type", value: invoice.type },
    invoice.reference ? { label: "Reference", value: invoice.reference } : null,
    invoice.placeOfSupply ? { label: "Place of Supply", value: invoice.placeOfSupply } : null,
  ].filter(Boolean) as { label: string; value: string }[];
}

function metaBox(ctx: TemplateRenderContext, opts: { bordered?: boolean } = {}): string {
  const rows = metaRows(ctx);
  const border = opts.bordered ? "border:1px solid #d1d5db;" : "border:1px solid #e5e7eb;";
  return `
    <div style="${border} border-radius:8px; padding:12px 14px; min-width:200px; max-width:100%;">
      ${rows
        .map(
          (r, i) => `
        <div style="display:flex; justify-content:space-between; gap:16px; font-size:11.5px; padding:3px 0; ${i !== rows.length - 1 ? "border-bottom:1px dashed #eee;" : ""}">
          <span style="color:#6b7280; white-space:nowrap;">${escapeHtml(r.label)}</span>
          <span style="font-weight:600; text-align:right; ${WRAP_SAFE}">${escapeHtml(r.value)}</span>
        </div>`,
        )
        .join("")}
    </div>`;
}

function addressBox(title: string, name: string, lines: (string | undefined)[], opts: { gstin?: string; bordered?: boolean } = {}): string {
  // Escape each line individually before joining — a stray "<", ">" or "&"
  // copy-pasted into an address/email/phone must never corrupt the markup.
  const body = lines.filter(Boolean).map(escapeHtml).join("<br/>");
  const border = opts.bordered === false ? "" : "border:1px solid #e5e7eb;";
  return `
    <div style="${border} border-radius:8px; padding:12px 14px; flex:1; min-width:0;">
      <p style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:700;margin:0 0 5px;">${escapeHtml(title)}</p>
      <p style="font-weight:700;margin:0 0 3px; font-size:13px; ${WRAP_SAFE}">${escapeHtml(name)}</p>
      ${body ? `<p style="font-size:11.5px;color:#6b7280;margin:0; ${WRAP_SAFE}">${body}</p>` : ""}
      ${opts.gstin ? `<p style="font-size:11px;color:#9ca3af;margin:5px 0 0; ${WRAP_SAFE}">GSTIN: ${escapeHtml(opts.gstin)}</p>` : ""}
    </div>`;
}

function billToBox(ctx: TemplateRenderContext, opts: { bordered?: boolean } = {}): string {
  const { customer } = ctx;
  return addressBox("Bill To", customer.name, [customer.billingAddress, customer.email, customer.phone], { gstin: customer.gstin, bordered: opts.bordered });
}

function shipToBox(ctx: TemplateRenderContext, opts: { bordered?: boolean } = {}): string {
  const { customer } = ctx;
  return addressBox("Ship To", customer.name, [customer.shippingAddress || customer.billingAddress], { bordered: opts.bordered });
}

function billFromBox(ctx: TemplateRenderContext, opts: { bordered?: boolean } = {}): string {
  const { company } = ctx;
  return addressBox("Bill From", company.name, [company.address], { gstin: company.gstin, bordered: opts.bordered });
}

function shipFromBox(ctx: TemplateRenderContext, opts: { bordered?: boolean } = {}): string {
  const { company } = ctx;
  return addressBox("Ship From", company.name, [company.address], { bordered: opts.bordered });
}

type ItemColumn = "hsnCol" | "mrp" | "taxableValue" | "taxAmountPct" | "taxPct";

function itemsTable(
  ctx: TemplateRenderContext,
  opts: {
    density?: Density;
    bordered?: "full" | "rows" | "none";
    striped?: boolean;
    serviceStyle?: boolean;
    showMrp?: boolean;
    hsnUnderName?: boolean;
    columns?: ItemColumn[];
    headerBg?: string;
  } = {},
): string {
  const { computedLines, settings } = ctx;
  const density = opts.density || NORMAL_DENSITY;
  const decimals = settings.priceDecimals ?? 2;
  const qtyDecimals = settings.showQuantity3Decimals ? 3 : 0;
  const striped = opts.striped ?? settings.showStripedRows;
  const bordered = opts.bordered ?? "rows";
  const serviceStyle = !!opts.serviceStyle;
  const showMrp = !!opts.showMrp;
  const hsnUnderName = !!opts.hsnUnderName;
  const cols = new Set(opts.columns || []);
  const showHsnCol = !settings.hideHsn && !serviceStyle && !hsnUnderName;
  const showQty = !settings.hideQuantity && !serviceStyle;
  const showDiscount = !settings.hideDiscount && settings.showDiscountColumn;
  const showTaxableValue = cols.has("taxableValue");
  const showTaxPct = cols.has("taxPct") || !cols.has("taxAmountPct");

  const outerBorder = bordered === "full" ? "border:1px solid #333;" : bordered === "rows" ? "border:1px solid #e5e7eb;" : "border:none;";
  const cellDivider = bordered === "full" ? "border:1px solid #333;" : bordered === "rows" ? "border-bottom:1px solid #eef0f2;" : "border-bottom:1px solid #f3f4f6;";
  const headerCellBorder = bordered === "full" ? "border:1px solid #333;" : "";

  const headerLabel = serviceStyle ? "Description" : "Item &amp; Description";

  // Numeric columns get generous fixed widths and `white-space:nowrap` value
  // cells (below) so a currency amount can never be forced to wrap — the
  // classic "₹" stranded on its own line above the number when a column is
  // too narrow. Only the Item & Description column (no fixed width, gets
  // the remainder) is expected to wrap, which is correct for long names.
  const cols_: { key: string; label: string; align: "left" | "right" | "center"; width?: string }[] = [{ key: "sr", label: "#", align: "left", width: "28px" }];
  cols_.push({ key: "name", label: headerLabel, align: "left" });
  if (showHsnCol) cols_.push({ key: "hsn", label: "HSN/SAC", align: "left", width: "74px" });
  if (showMrp) cols_.push({ key: "mrp", label: "MRP", align: "right", width: "88px" });
  cols_.push({ key: "rate", label: showMrp ? "Selling Price" : "Rate", align: "right", width: "92px" });
  if (showQty) cols_.push({ key: "qty", label: "Qty", align: "right", width: "50px" });
  if (showDiscount) cols_.push({ key: "discount", label: "Discount", align: "right", width: "82px" });
  if (showTaxableValue) cols_.push({ key: "taxable", label: "Taxable Value", align: "right", width: "108px" });
  if (showTaxPct) cols_.push({ key: "taxpct", label: cols.has("taxAmountPct") ? "Tax Amount (%)" : "Tax %", align: "right", width: cols.has("taxAmountPct") ? "132px" : "62px" });
  cols_.push({ key: "amount", label: "Amount", align: "right", width: "112px" });

  const head = settings.enableItemHeaders
    ? `<thead><tr style="background:${opts.headerBg || ctx.settings.accentColor}; color:white;">
        ${cols_.map((c) => `<th style="padding:${density.pad}; ${headerCellBorder} font-size:${density.headFontSize}; text-transform:uppercase; letter-spacing:.4px; text-align:${c.align}; ${c.width ? `width:${c.width};` : ""}">${c.label}</th>`).join("")}
      </tr></thead>`
    : "";

  const rows = computedLines
    .map((line, i) => {
      const bg = striped && i % 2 === 1 ? "background:#f9fafb;" : "";
      const td = (content: string, align: "left" | "right" | "center" = "left", extra = "") =>
        `<td style="padding:${density.pad}; ${cellDivider} ${bg} font-size:${density.fontSize}; text-align:${align}; ${extra}">${content}</td>`;

      const nameCell = `
        <div style="font-weight:600; ${WRAP_SAFE}">${escapeHtml(line.name || "Item")}</div>
        ${hsnUnderName && !settings.hideHsn && line.hsn ? `<div style="font-size:10.5px; color:#9ca3af; margin-top:1px; ${WRAP_SAFE}">HSN/SAC: ${escapeHtml(line.hsn)}</div>` : ""}`;

      const cells: string[] = [td(String(i + 1), "left", "color:#9ca3af;")];
      cells.push(td(nameCell, "left", WRAP_SAFE));
      if (showHsnCol) cells.push(td(escapeHtml(line.hsn || "-"), "left", `color:#6b7280; ${WRAP_SAFE}`));
      // "MRP + Discount" template: the entered Rate is the listed MRP; the
      // per-unit price after this line's own discount is the Selling Price —
      // both derived from real invoice data, nothing fabricated.
      const sellingPricePerUnit = line.qty > 0 ? (line.gross - line.lineDiscountAmount) / line.qty : line.unitPrice;
      if (showMrp) cells.push(td(fmtNum(line.unitPrice, decimals), "right", NOWRAP));
      cells.push(td(fmtNum(showMrp ? sellingPricePerUnit : line.unitPrice, decimals), "right", NOWRAP));
      if (showQty) cells.push(td(fmtNum(line.qty, qtyDecimals), "right", NOWRAP));
      if (showDiscount) {
        cells.push(
          td(
            line.lineDiscountAmount
              ? `${fmtNum(line.discount, 2)}${line.discountMode === "percent" ? "%" : ""}`
              : "-",
            "right",
            NOWRAP,
          ),
        );
      }
      if (showTaxableValue) cells.push(td(fmtNum(line.taxableValue, decimals), "right", NOWRAP));
      if (showTaxPct) {
        cells.push(
          td(
            cols.has("taxAmountPct") ? `${money(line.taxAmount, decimals)} <span style="color:#9ca3af;">(${fmtNum(line.taxRate, 0)}%)</span>` : `${fmtNum(line.taxRate, 0)}%`,
            "right",
            NOWRAP,
          ),
        );
      }
      cells.push(td(money(line.lineTotal, decimals), "right", `font-weight:700; ${NOWRAP}`));

      return `<tr style="break-inside:avoid; page-break-inside:avoid;">${cells.join("")}</tr>`;
    })
    .join("");

  return `
    <table style="width:100%; border-collapse:collapse; margin-bottom:18px; table-layout:fixed; ${outerBorder}">
      ${head}
      <tbody>${rows}</tbody>
    </table>`;
}

function hsnSummaryTable(ctx: TemplateRenderContext, opts: { bordered?: boolean; showRates?: boolean } = {}): string {
  const { hsnSummary, settings, documentType, totals } = ctx;
  if (!settings.showHsnSummary || !settings.showHsnSummaryOn?.includes(documentType) || hsnSummary.length === 0) return "";
  const decimals = settings.priceDecimals ?? 2;
  const bordered = !!opts.bordered;
  const border = bordered ? "border:1px solid #333;" : "border-bottom:1px solid #eee;";
  const th = (label: string, align: "left" | "right" = "right") => `<th style="padding:7px 8px; ${bordered ? border : ""} font-size:10.5px; text-align:${align}; background:#f3f4f6; white-space:nowrap;">${label}</th>`;
  const td = (content: string, align: "left" | "right" = "right", extra = "") => `<td style="padding:7px 8px; ${border} font-size:11.5px; text-align:${align}; ${extra}">${content}</td>`;

  const rateOf = (amt: number, taxable: number) => (taxable > 0 ? fmtNum((amt / taxable) * 100, 1) : "0");

  const rows = hsnSummary
    .map((r: HsnSummaryRow) => {
      const cells = [td(escapeHtml(r.hsn) || "-", "left", WRAP_SAFE), td(fmtNum(r.taxableValue, decimals), "right", NOWRAP)];
      if (totals.isInterState) {
        cells.push(td(opts.showRates ? `${rateOf(r.igstAmount, r.taxableValue)}% / ${fmtNum(r.igstAmount, decimals)}` : fmtNum(r.igstAmount, decimals), "right", NOWRAP));
      } else {
        cells.push(td(opts.showRates ? `${rateOf(r.cgstAmount, r.taxableValue)}% / ${fmtNum(r.cgstAmount, decimals)}` : fmtNum(r.cgstAmount, decimals), "right", NOWRAP));
        cells.push(td(opts.showRates ? `${rateOf(r.sgstAmount, r.taxableValue)}% / ${fmtNum(r.sgstAmount, decimals)}` : fmtNum(r.sgstAmount, decimals), "right", NOWRAP));
      }
      cells.push(td(fmtNum(r.total, decimals), "right", NOWRAP));
      return `<tr style="break-inside:avoid; page-break-inside:avoid;">${cells.join("")}</tr>`;
    })
    .join("");

  const headCols = totals.isInterState
    ? [th("HSN/SAC", "left"), th("Taxable Value"), th("IGST"), th("Total")]
    : [th("HSN/SAC", "left"), th("Taxable Value"), th("CGST"), th("SGST"), th("Total")];

  return `
    <div style="margin:20px 0;">
      <p style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; margin-bottom:6px;">HSN/SAC Summary</p>
      <table style="width:100%; border-collapse:collapse; ${bordered ? border : ""}">
        <thead><tr>${headCols.join("")}</tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function totalsCard(ctx: TemplateRenderContext, accent: string, opts: { retail?: boolean } = {}): string {
  const { totals, settings } = ctx;
  const decimals = settings.priceDecimals ?? 2;
  const row = (label: string, value: string, bold = false) => `
    <div style="display:flex; justify-content:space-between; gap:16px; padding:4px 0; ${bold ? "font-weight:700;" : "color:#4b5563;"} font-size:${bold ? "12.5px" : "11.5px"};">
      <span style="${WRAP_SAFE}">${escapeHtml(label)}</span><span style="${NOWRAP}">${value}</span>
    </div>`;

  let rows = row("Subtotal", money(totals.subtotal, decimals));
  if (totals.totalDiscount) rows += row("Total Discount", `- ${money(totals.totalDiscount, decimals)}`);
  rows += row("Taxable Amount", money(totals.taxableAmount, decimals), true);
  for (const g of totals.gstBreakup) {
    rows += g.label === "TDS" ? row("TDS", `- ${money(Math.abs(g.amount), decimals)}`) : row(g.label, money(g.amount, decimals));
  }
  if (settings.showRoundOff && totals.roundOffAmount) rows += row("Round Off", money(totals.roundOffAmount, decimals));

  const { paid, payable } = amountPayable(ctx);

  const bottom = opts.retail
    ? `
      <div style="display:flex; justify-content:space-between; gap:12px; border-top:2px solid ${accent}; margin-top:8px; padding-top:8px;">
        <span style="font-size:14px; font-weight:800;">Amount Payable</span>
        <span style="font-size:18px; font-weight:900; color:${accent}; ${NOWRAP}">${money(payable, decimals)}</span>
      </div>
      ${paid ? row("Amount Paid", money(paid, decimals)) : ""}`
    : `
      <div style="display:flex; justify-content:space-between; gap:12px; border-top:2px solid ${accent}; margin-top:8px; padding-top:8px;">
        <span style="font-size:14px; font-weight:800;">Total</span>
        <span style="font-size:18px; font-weight:900; color:${accent}; ${NOWRAP}">${money(totals.totalAmount, decimals)}</span>
      </div>
      ${paid ? `${row("Amount Paid", money(paid, decimals))}${row("Amount Payable", money(payable, decimals), true)}` : ""}`;

  return `
    <div style="background:#f9fafb; border-radius:10px; padding:16px 18px; min-width:260px; max-width:100%; break-inside:avoid; page-break-inside:avoid;">
      ${rows}
      ${bottom}
    </div>`;
}

function bankAndQrBlock(ctx: TemplateRenderContext): string {
  const { bank, upiQrDataUrl, settings } = ctx;
  if (!settings.showPayments || (!bank && !upiQrDataUrl)) return "";
  return `
    <div style="display:flex; gap:18px; align-items:flex-start; flex-wrap:wrap; break-inside:avoid; page-break-inside:avoid;">
      ${
        upiQrDataUrl
          ? `<div style="text-align:center; flex-shrink:0;">
              <img src="${upiQrDataUrl}" alt="UPI QR" style="width:88px;height:88px;" />
              <p style="font-size:9.5px; color:#6b7280; margin:4px 0 0;">Pay using UPI</p>
            </div>`
          : ""
      }
      ${
        bank
          ? `<div style="font-size:11.5px; color:#4b5563; min-width:0; ${WRAP_SAFE}">
              <p style="font-weight:700; margin:0 0 3px;">Bank Details</p>
              <p style="margin:0;">${escapeHtml(bank.accountName)}</p>
              ${bank.bankName ? `<p style="margin:0;">${escapeHtml(bank.bankName)}</p>` : ""}
              ${bank.accountNumber ? `<p style="margin:0;">A/C: ${escapeHtml(bank.accountNumber)}</p>` : ""}
              ${bank.ifsc ? `<p style="margin:0;">IFSC: ${escapeHtml(bank.ifsc)}</p>` : ""}
            </div>`
          : ""
      }
    </div>`;
}

function paymentsBlock(ctx: TemplateRenderContext): string {
  const { invoice, settings } = ctx;
  if (!settings.showPayments || !invoice.payments?.length) return "";
  const rows = invoice.payments
    .map(
      (p) => `
    <div style="display:flex; justify-content:space-between; gap:12px; font-size:10.5px; padding:2px 0; color:#4b5563;">
      <span style="${WRAP_SAFE}">${dateStr(p.date)} &middot; ${escapeHtml(p.mode)}</span><span style="${NOWRAP}">${money(p.amount, settings.priceDecimals ?? 2)}</span>
    </div>`,
    )
    .join("");
  return `
    <div style="margin-top:12px; break-inside:avoid; page-break-inside:avoid;">
      <p style="font-size:10px; font-weight:700; text-transform:uppercase; color:#9ca3af; margin:0 0 4px;">Payments ${invoice.markedFullyPaid ? "&middot; Fully Paid" : ""}</p>
      ${rows}
    </div>`;
}

function signatureBlock(ctx: TemplateRenderContext, opts: { forCompanyLine?: boolean } = {}): string {
  if (!ctx.settings.showReceiverSignature) return "";
  return `
    <div style="text-align:right; break-inside:avoid; page-break-inside:avoid;">
      ${opts.forCompanyLine ? `<div style="font-size:11.5px; color:#4b5563; margin-bottom:${ctx.signatureUrl ? "36px" : "44px"}; ${WRAP_SAFE}">For ${escapeHtml(ctx.company.name)}</div>` : ctx.signatureUrl ? "" : `<div style="height:38px;"></div>`}
      ${ctx.signatureUrl ? `<img src="${escapeHtml(ctx.signatureUrl)}" style="height:46px; margin-bottom:6px;" />` : ""}
      <div style="width:180px; margin-left:auto; border-top:1px solid #9ca3af; padding-top:5px; font-size:10.5px; color:#6b7280;">Authorized Signatory</div>
    </div>`;
}

function notesTermsBlock(ctx: TemplateRenderContext): string {
  const { invoice } = ctx;
  if (!invoice.notes && !invoice.terms) return "";
  return `
    <div style="min-width:0;">
      ${invoice.notes ? `<div style="margin-bottom:12px; break-inside:avoid; page-break-inside:avoid;"><p style="font-size:10px; font-weight:700; text-transform:uppercase; color:#9ca3af; margin:0 0 4px;">Notes</p><p style="font-size:11.5px; color:#4b5563; margin:0; max-width:420px; ${WRAP_SAFE}">${escapeHtml(invoice.notes)}</p></div>` : ""}
      ${invoice.terms ? `<div style="break-inside:avoid; page-break-inside:avoid;"><p style="font-size:10px; font-weight:700; text-transform:uppercase; color:#9ca3af; margin:0 0 4px;">Terms &amp; Conditions</p><p style="font-size:11px; color:#6b7280; margin:0; max-width:420px; ${WRAP_SAFE}">${escapeHtml(invoice.terms)}</p></div>` : ""}
    </div>`;
}

function eDocBadges(ctx: TemplateRenderContext, accent: string): string {
  return [ctx.invoice.eWaybill ? "E-Waybill" : null, ctx.invoice.eInvoice ? "E-Invoice" : null]
    .filter(Boolean)
    .map((b) => `<span style="display:inline-block; background:${accent}1a; color:${accent}; font-size:9.5px; font-weight:700; padding:2px 8px; border-radius:6px; margin-right:6px;">${b}</span>`)
    .join("");
}

function amountInWordsLine(ctx: TemplateRenderContext): string {
  return `<p style="font-size:10.5px; color:#6b7280; margin:8px 0 0;"><strong>Amount in Words:</strong> ${escapeHtml(ctx.amountInWords)}</p>`;
}

function footerLine(ctx: TemplateRenderContext): string {
  return `
    <div style="margin-top:28px; padding-top:12px; border-top:1px solid #e5e7eb; text-align:center; font-size:9.5px; color:#9ca3af;">
      ${ctx.settings.pdfFooterText ? `<p style="margin:0 0 3px;">${escapeHtml(ctx.settings.pdfFooterText)}</p>` : ""}
      <p style="margin:0;">Page 1/1 &middot; This is a digitally signed document and does not require a physical signature.</p>
    </div>`;
}

// ============================================================
// PART 2 — one composer per ACTIVE template. Each returns the HTML that
// goes *inside* the A4 page box; genuinely different structure per
// category, not just a palette of the same three boxes.
// ============================================================

function renderModern(ctx: TemplateRenderContext, accent: string): string {
  const dense = NORMAL_DENSITY;
  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding-bottom:18px; margin-bottom:22px; border-bottom:2px solid ${accent};">
      ${sellerBlock(ctx)}
      <div style="text-align:right; min-width:0; flex-shrink:0;">
        ${logoImg(ctx)}
        <div style="margin-top:6px;">${titleBlock(ctx, accent, { showOriginal: true })}</div>
      </div>
    </div>
    <div style="margin:-10px 0 14px;">${eDocBadges(ctx, accent)}</div>
    <div style="display:flex; gap:16px; margin-bottom:22px; align-items:stretch; flex-wrap:wrap;">
      ${billToBox(ctx)}
      ${shipToBox(ctx)}
      ${metaBox(ctx)}
    </div>
    ${itemsTable(ctx, { density: dense, bordered: "rows", hsnUnderName: true, columns: ["taxableValue", "taxAmountPct"] })}
    ${hsnSummaryTable(ctx)}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-top:8px; flex-wrap:wrap;">
      <div style="max-width:52%; min-width:0; flex:1 1 320px;">
        ${notesTermsBlock(ctx)}
        <div style="margin-top:16px;">${bankAndQrBlock(ctx)}</div>
        ${paymentsBlock(ctx)}
      </div>
      <div style="min-width:0;">
        ${totalsCard(ctx, accent)}
        ${amountInWordsLine(ctx)}
      </div>
    </div>
    <div style="margin-top:36px;">${signatureBlock(ctx, { forCompanyLine: true })}</div>
    ${footerLine(ctx)}`;
}

function renderClassic(ctx: TemplateRenderContext, accent: string): string {
  const dense = NORMAL_DENSITY;
  return `
    <div style="border:2px solid #1f2937; margin-bottom:16px;">
      <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; padding:14px 18px; border-bottom:1px solid #1f2937;">
        <div style="min-width:0;">${sellerBlock(ctx)}</div>
        <div style="text-align:right; min-width:0; flex-shrink:0;">${logoImg(ctx)}${titleBlock(ctx, accent, { showOriginal: true })}</div>
      </div>
      <div style="display:flex; flex-wrap:wrap;">
        <div style="flex:1; min-width:0; border-right:1px solid #1f2937;">${billToBox(ctx, { bordered: false })}</div>
        <div style="flex:1; min-width:0;">${metaBox(ctx, { bordered: false })}</div>
      </div>
    </div>
    <div style="margin:-8px 0 14px;">${eDocBadges(ctx, accent)}</div>
    ${itemsTable(ctx, { density: dense, bordered: "full", columns: ["taxableValue", "taxPct"] })}
    ${hsnSummaryTable(ctx, { bordered: true, showRates: true })}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-top:8px; flex-wrap:wrap;">
      <div style="max-width:52%; min-width:0; flex:1 1 320px;">
        ${notesTermsBlock(ctx)}
        <div style="margin-top:16px;">${bankAndQrBlock(ctx)}</div>
        ${paymentsBlock(ctx)}
      </div>
      <div style="min-width:0;">
        ${totalsCard(ctx, accent)}
        ${amountInWordsLine(ctx)}
      </div>
    </div>
    <div style="margin-top:36px;">${signatureBlock(ctx, { forCompanyLine: true })}</div>
    ${footerLine(ctx)}`;
}

function renderCompact(ctx: TemplateRenderContext, accent: string): string {
  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px; padding-bottom:10px; margin-bottom:12px; border-bottom:1px solid ${accent};">
      ${sellerBlock(ctx, { nameSize: 16 })}
      <div style="text-align:right; min-width:0; flex-shrink:0;">${titleBlock(ctx, accent)}</div>
    </div>
    <div style="display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap;">
      ${billToBox(ctx)}
      ${metaBox(ctx)}
    </div>
    ${itemsTable(ctx, { density: COMPACT_DENSITY, bordered: "rows", hsnUnderName: true, columns: ["taxPct"] })}
    ${hsnSummaryTable(ctx)}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; margin-top:6px; flex-wrap:wrap;">
      <div style="max-width:52%; min-width:0; flex:1 1 320px;">
        ${notesTermsBlock(ctx)}
        <div style="margin-top:10px;">${bankAndQrBlock(ctx)}</div>
        ${paymentsBlock(ctx)}
      </div>
      <div style="min-width:0;">${totalsCard(ctx, accent)}${amountInWordsLine(ctx)}</div>
    </div>
    <div style="margin-top:20px;">${signatureBlock(ctx)}</div>
    ${footerLine(ctx)}`;
}

function renderEvergreen(ctx: TemplateRenderContext, accent: string): string {
  return `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; padding:14px 16px; border:1px solid #d1fae5; border-radius:12px; margin-bottom:18px; background:#f0fdf4; flex-wrap:wrap;">
      <div style="display:flex; align-items:center; gap:12px; min-width:0;">
        ${logoImg(ctx, 44)}
        ${sellerBlock(ctx)}
      </div>
      <div style="text-align:right; min-width:0; flex-shrink:0;">${titleBlock(ctx, accent, { showOriginal: true })}</div>
    </div>
    <div style="margin:-8px 0 14px;">${eDocBadges(ctx, accent)}</div>
    <div style="display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap;">
      ${billToBox(ctx)}
      ${shipToBox(ctx)}
      ${metaBox(ctx)}
    </div>
    ${itemsTable(ctx, { density: NORMAL_DENSITY, bordered: "rows", striped: true, columns: ["taxPct"] })}
    ${hsnSummaryTable(ctx)}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-top:8px; flex-wrap:wrap;">
      <div style="max-width:52%; min-width:0; flex:1 1 320px;">
        ${notesTermsBlock(ctx)}
        <div style="margin-top:16px;">${bankAndQrBlock(ctx)}</div>
        ${paymentsBlock(ctx)}
      </div>
      <div style="min-width:0;">${totalsCard(ctx, accent)}${amountInWordsLine(ctx)}</div>
    </div>
    <div style="margin-top:32px;">${signatureBlock(ctx, { forCompanyLine: true })}</div>
    ${footerLine(ctx)}`;
}

function renderLandscape(ctx: TemplateRenderContext, accent: string): string {
  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:20px; padding-bottom:14px; margin-bottom:18px; border-bottom:2px solid ${accent}; flex-wrap:wrap;">
      ${sellerBlock(ctx)}
      <div style="flex:1; min-width:160px;">${billToBox(ctx)}</div>
      <div style="flex:1; min-width:160px;">${shipToBox(ctx)}</div>
      <div style="min-width:220px; flex-shrink:0;">
        ${titleBlock(ctx, accent, { showOriginal: true })}
        <div style="margin-top:8px;">${metaBox(ctx)}</div>
      </div>
    </div>
    <div style="margin:-10px 0 14px;">${eDocBadges(ctx, accent)}</div>
    ${itemsTable(ctx, { density: NORMAL_DENSITY, bordered: "rows", columns: ["taxableValue", "taxAmountPct"] })}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-top:10px; flex-wrap:wrap;">
      <div style="flex:1; min-width:220px;">${hsnSummaryTable(ctx)}</div>
      <div style="flex:1; min-width:220px;">
        ${notesTermsBlock(ctx)}
        <div style="margin-top:14px;">${bankAndQrBlock(ctx)}</div>
        ${paymentsBlock(ctx)}
      </div>
      <div style="min-width:0;">${totalsCard(ctx, accent)}${amountInWordsLine(ctx)}</div>
    </div>
    <div style="margin-top:28px; display:flex; justify-content:flex-end;">${signatureBlock(ctx, { forCompanyLine: true })}</div>
    ${footerLine(ctx)}`;
}

function renderLegend(ctx: TemplateRenderContext, accent: string): string {
  return `
    <table style="width:100%; border-collapse:collapse; border:1px solid #333; margin-bottom:16px;">
      <tr>
        <td style="border:1px solid #333; padding:14px 16px; width:55%; vertical-align:top;">
          ${logoImg(ctx, 40)}
          <div style="margin-top:6px;">${sellerBlock(ctx)}</div>
        </td>
        <td style="border:1px solid #333; padding:14px 16px; vertical-align:top;">${titleBlock(ctx, accent, { align: "left", showOriginal: true })}</td>
      </tr>
      <tr>
        <td style="border:1px solid #333; padding:0; vertical-align:top;">${billToBox(ctx, { bordered: false })}</td>
        <td style="border:1px solid #333; padding:0; vertical-align:top;">${metaBox(ctx, { bordered: false })}</td>
      </tr>
    </table>
    <div style="margin:-10px 0 14px;">${eDocBadges(ctx, accent)}</div>
    ${itemsTable(ctx, { density: NORMAL_DENSITY, bordered: "full", columns: ["taxableValue", "taxPct"] })}
    ${hsnSummaryTable(ctx, { bordered: true, showRates: true })}
    <table style="width:100%; border-collapse:collapse; border:1px solid #333; margin-top:10px;">
      <tr>
        <td style="border:1px solid #333; padding:14px 16px; vertical-align:top; width:55%;">
          ${notesTermsBlock(ctx)}
          <div style="margin-top:14px;">${bankAndQrBlock(ctx)}</div>
          ${paymentsBlock(ctx)}
        </td>
        <td style="border:1px solid #333; padding:14px 16px; vertical-align:top;">
          ${totalsCard(ctx, accent)}
          ${amountInWordsLine(ctx)}
        </td>
      </tr>
      <tr>
        <td colspan="2" style="border:1px solid #333; padding:14px 16px;">${signatureBlock(ctx, { forCompanyLine: true })}</td>
      </tr>
    </table>
    ${footerLine(ctx)}`;
}

function renderMrpDiscount(ctx: TemplateRenderContext, accent: string): string {
  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding-bottom:16px; margin-bottom:20px; border-bottom:2px solid ${accent};">
      ${sellerBlock(ctx)}
      <div style="text-align:right; min-width:0; flex-shrink:0;">
        ${logoImg(ctx)}
        <div style="margin-top:6px;">${titleBlock(ctx, accent, { showOriginal: true })}</div>
      </div>
    </div>
    <div style="margin:-10px 0 14px;">${eDocBadges(ctx, accent)}</div>
    <div style="display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap;">
      ${billToBox(ctx)}
      ${metaBox(ctx)}
    </div>
    ${itemsTable(ctx, { density: NORMAL_DENSITY, bordered: "rows", showMrp: true, columns: ["taxPct"] })}
    ${hsnSummaryTable(ctx)}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-top:8px; flex-wrap:wrap;">
      <div style="max-width:52%; min-width:0; flex:1 1 320px;">
        ${notesTermsBlock(ctx)}
        <div style="margin-top:16px;">${bankAndQrBlock(ctx)}</div>
        ${paymentsBlock(ctx)}
      </div>
      <div style="min-width:0;">
        ${totalsCard(ctx, accent, { retail: true })}
        ${amountInWordsLine(ctx)}
      </div>
    </div>
    <div style="margin-top:32px;">${signatureBlock(ctx, { forCompanyLine: true })}</div>
    ${footerLine(ctx)}`;
}

function renderService(ctx: TemplateRenderContext, accent: string): string {
  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; padding-bottom:18px; margin-bottom:22px; border-bottom:2px solid ${accent};">
      ${sellerBlock(ctx)}
      <div style="text-align:right; min-width:0; flex-shrink:0;">
        ${logoImg(ctx)}
        <div style="margin-top:6px;">${titleBlock(ctx, accent, { showOriginal: true })}</div>
      </div>
    </div>
    <div style="margin:-10px 0 14px;">${eDocBadges(ctx, accent)}</div>
    <div style="display:flex; gap:16px; margin-bottom:22px; align-items:stretch; flex-wrap:wrap;">
      ${billToBox(ctx)}
      ${shipToBox(ctx)}
      ${metaBox(ctx)}
    </div>
    ${itemsTable(ctx, { density: NORMAL_DENSITY, bordered: "rows", serviceStyle: true })}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-top:8px; flex-wrap:wrap;">
      <div style="max-width:52%; min-width:0; flex:1 1 320px;">
        ${notesTermsBlock(ctx)}
        <div style="margin-top:16px;">${bankAndQrBlock(ctx)}</div>
        ${paymentsBlock(ctx)}
      </div>
      <div style="min-width:0;">
        ${totalsCard(ctx, accent)}
        ${amountInWordsLine(ctx)}
      </div>
    </div>
    <div style="margin-top:32px;">${signatureBlock(ctx, { forCompanyLine: true })}</div>
    ${footerLine(ctx)}`;
}

function renderBillShip(ctx: TemplateRenderContext, accent: string): string {
  return `
    <div style="display:flex; justify-content:space-between; align-items:center; gap:16px; margin-bottom:18px; padding-bottom:14px; border-bottom:2px solid ${accent}; flex-wrap:wrap;">
      <div style="display:flex; align-items:center; gap:12px; min-width:0;">${logoImg(ctx)}${sellerBlock(ctx)}</div>
      <div style="text-align:right; min-width:0; flex-shrink:0;">${titleBlock(ctx, accent, { showOriginal: true })}</div>
    </div>
    <div style="margin:-8px 0 14px;">${eDocBadges(ctx, accent)}</div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:14px; margin-bottom:20px;">
      ${billFromBox(ctx)}
      ${shipFromBox(ctx)}
      ${billToBox(ctx)}
      ${shipToBox(ctx)}
    </div>
    <div style="margin-bottom:16px;">${metaBox(ctx)}</div>
    ${itemsTable(ctx, { density: NORMAL_DENSITY, bordered: "rows", columns: ["taxAmountPct"] })}
    ${hsnSummaryTable(ctx)}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:24px; margin-top:8px; flex-wrap:wrap;">
      <div style="max-width:52%; min-width:0; flex:1 1 320px;">
        ${notesTermsBlock(ctx)}
        <div style="margin-top:16px;">${bankAndQrBlock(ctx)}</div>
        ${paymentsBlock(ctx)}
      </div>
      <div style="min-width:0;">
        ${totalsCard(ctx, accent)}
        ${amountInWordsLine(ctx)}
      </div>
    </div>
    <div style="margin-top:32px;">${signatureBlock(ctx, { forCompanyLine: true })}</div>
    ${footerLine(ctx)}`;
}

// ============================================================
// PART 3 — legacy generic composer, kept ONLY for the 5 dormant/inactive
// template keys (vintage, elegant, elegant_images, service_2, genz) so
// they still render if reactivated later, without maintaining bespoke
// layouts for categories that aren't currently in scope.
// ============================================================

function borderCssLegacy(def: TemplateDefinition, accent: string): string {
  switch (def.borderStyle) {
    case "double":
      return `border: 3px double ${accent};`;
    case "heavy-grid":
      return `border: 2px solid #222;`;
    case "thin":
      return `border: 1px solid #d1d5db;`;
    default:
      return "";
  }
}

function renderLegacyGeneric(def: TemplateDefinition, ctx: TemplateRenderContext, accent: string): string {
  const titleWord = ctx.documentType === "purchase" ? "PURCHASE BILL" : ctx.documentType === "quotation" ? "QUOTATION" : "TAX INVOICE";
  const logo = logoImg(ctx);

  let header: string;
  if (def.headerStyle === "gradient-band") {
    header = `
      <div style="background: linear-gradient(120deg, ${accent}, #111827); color: white; padding: 28px 32px; border-radius: 16px; margin-bottom: 24px; display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <div style="min-width:0;"><div style="font-size: 28px; font-weight: 800; letter-spacing: 1px;">${titleWord}</div><div style="opacity:.85; margin-top:4px; ${WRAP_SAFE}">#${escapeHtml(ctx.invoice.number)}</div></div>
        <div style="text-align:right; min-width:0;">${logo}<div style="font-size:18px; font-weight:700; margin-top:4px; ${WRAP_SAFE}">${escapeHtml(ctx.company.name)}</div></div>
      </div>`;
  } else if (def.headerStyle === "centered") {
    header = `
      <div style="text-align:center; padding-bottom:16px; margin-bottom:24px; border-bottom: 1px solid ${accent};">
        ${logo}
        <div style="font-size:22px; font-weight:700; letter-spacing:2px; color:${accent}; margin-top:8px; ${WRAP_SAFE}">${escapeHtml(ctx.company.name)}</div>
        <div style="font-size:13px; color:#6b7280; margin-top:6px; text-transform:uppercase; letter-spacing:3px; ${WRAP_SAFE}">${titleWord} &middot; #${escapeHtml(ctx.invoice.number)}</div>
      </div>`;
  } else if (def.headerStyle === "bordered-grid") {
    header = `
      <div style="${borderCssLegacy(def, accent)} padding:16px 20px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; gap:16px; flex-wrap:wrap;">
        <div style="min-width:0;">${logo}<div style="font-size:20px; font-weight:700; ${WRAP_SAFE}">${escapeHtml(ctx.company.name)}</div>${ctx.company.gstin ? `<div style="font-size:11px;color:#555; ${WRAP_SAFE}">GSTIN: ${escapeHtml(ctx.company.gstin)}</div>` : ""}</div>
        <div style="text-align:right; min-width:0; flex-shrink:0;"><div style="font-size:20px; font-weight:800; letter-spacing:1px;">${titleWord}</div><div style="font-size:12px; color:#555;"># ${escapeHtml(ctx.invoice.number)}</div></div>
      </div>`;
  } else {
    header = `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:16px; border-bottom: 2px solid ${accent}; padding-bottom: 20px; margin-bottom: 28px; flex-wrap:wrap;">
        <div style="min-width:0;"><div style="font-size:32px; font-weight:800; text-transform:uppercase; letter-spacing:2px; color:${accent};">${titleWord}</div><div style="color:#6b7280; margin-top:6px; font-weight:500; ${WRAP_SAFE}"># ${escapeHtml(ctx.invoice.number)}</div></div>
        <div style="text-align:right; min-width:0; flex-shrink:0;">${logo}<div style="font-size:20px; font-weight:700; ${WRAP_SAFE}">${escapeHtml(ctx.company.name)}</div>${ctx.company.gstin ? `<div style="font-size:11px;color:#6b7280; ${WRAP_SAFE}">GSTIN: ${escapeHtml(ctx.company.gstin)}</div>` : ""}</div>
      </div>`;
  }

  return `
    ${header}
    <div style="margin:-10px 0 14px;">${eDocBadges(ctx, accent)}</div>
    <div style="display:flex; gap:16px; margin-bottom:24px; align-items:stretch; flex-wrap:wrap;">
      ${billToBox(ctx)}
      ${def.billShipProminent ? shipToBox(ctx) : ""}
      ${metaBox(ctx)}
    </div>
    ${itemsTable(ctx, { bordered: def.borderStyle === "heavy-grid" || def.borderStyle === "double" ? "full" : "rows", serviceStyle: def.serviceStyle, showMrp: def.showMrpColumn, density: def.density === "compact" ? COMPACT_DENSITY : NORMAL_DENSITY })}
    ${hsnSummaryTable(ctx)}
    <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:20px; gap:24px; flex-wrap:wrap;">
      <div style="max-width:55%; min-width:0; flex:1 1 320px;">
        ${notesTermsBlock(ctx)}
        <div style="margin-top:14px;">${paymentsBlock(ctx)}${bankAndQrBlock(ctx)}</div>
      </div>
      <div style="min-width:0;">${totalsCard(ctx, accent)}${amountInWordsLine(ctx)}</div>
    </div>
    <div style="margin-top:40px;">${signatureBlock(ctx)}</div>
    ${footerLine(ctx)}`;
}

// ============================================================
// PART 4 — dispatch + page/document wrapping.
// ============================================================

const ACTIVE_RENDERERS: Record<string, (ctx: TemplateRenderContext, accent: string) => string> = {
  modern: renderModern,
  classic: renderClassic,
  compact: renderCompact,
  evergreen: renderEvergreen,
  landscape: renderLandscape,
  legend: renderLegend,
  mrp_discount: renderMrpDiscount,
  service: renderService,
  bill_ship: renderBillShip,
};

/**
 * Renders just the invoice content as a single self-contained, inline-styled
 * `<div>` (the "page"). No `<html>/<head>/<body>`, no global `<style>` block
 * — safe to inject via `dangerouslySetInnerHTML` anywhere (gallery preview)
 * without CSS leaking in or out, and without needing an iframe (which this
 * app's CSP `frame-ancestors 'none'` blocks even same-origin).
 * `renderInvoiceTemplate()` below wraps this same output for the full
 * printable document, so preview and PDF are guaranteed structurally
 * identical.
 */
export function renderInvoiceTemplateFragment(def: TemplateDefinition, ctx: TemplateRenderContext): string {
  const accent = ctx.settings.accentColor || def.accentColorDefault;
  const font = FONT_STACK[def.fontFamily];
  const fontSizePx = ctx.settings.pdfFontSize === "Small" ? 12 : ctx.settings.pdfFontSize === "Large" ? 16 : 14;
  const pageWidth = def.orientation === "landscape" ? "297mm" : "210mm";
  const pageMinHeight = def.orientation === "landscape" ? "210mm" : "297mm";

  const renderer = ACTIVE_RENDERERS[def.key];
  const body = renderer ? renderer(ctx, accent) : renderLegacyGeneric(def, ctx, accent);

  return `
    <div style="width:${pageWidth}; min-height:${pageMinHeight}; margin:0; background:white; box-sizing:border-box; position:relative; font-family:${font}; font-size:${fontSizePx}px; color:#111827; padding:${ctx.settings.marginTop}px ${ctx.settings.marginRight}px ${ctx.settings.marginBottom}px ${ctx.settings.marginLeft}px;">
      ${ctx.settings.bannerTopUrl ? `<img src="${escapeHtml(ctx.settings.bannerTopUrl)}" style="width:100%; margin-bottom:16px;" />` : ""}
      ${ctx.settings.watermarkUrl ? `<img src="${escapeHtml(ctx.settings.watermarkUrl)}" style="position:fixed; opacity:.06; top:35%; left:15%; width:70%; z-index:0;" />` : ""}
      <div style="position:relative; z-index:1;">
        ${ctx.settings.headerImageUrl ? `<img src="${escapeHtml(ctx.settings.headerImageUrl)}" style="width:100%; margin-bottom:12px;" />` : ""}
        ${body}
        ${ctx.settings.footerImageUrl ? `<img src="${escapeHtml(ctx.settings.footerImageUrl)}" style="width:100%; margin-top:20px;" />` : ""}
      </div>
      ${ctx.settings.bannerBottomUrl ? `<img src="${escapeHtml(ctx.settings.bannerBottomUrl)}" style="width:100%; margin-top:12px;" />` : ""}
    </div>`;
}

/** Full printable HTML document — wraps `renderInvoiceTemplateFragment()` with `<html>/<head>` chrome, `@page` sizing, and the print button. Used by the PDF route. */
export function renderInvoiceTemplate(def: TemplateDefinition, ctx: TemplateRenderContext): string {
  const accent = ctx.settings.accentColor || def.accentColorDefault;
  const pageSize = def.orientation === "landscape" ? "297mm 210mm" : "210mm 297mm";
  const fragment = renderInvoiceTemplateFragment(def, ctx);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(ctx.invoice.number)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Roboto+Mono&family=Merriweather:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  @page { size: ${pageSize}; margin: 0; }
  body { margin:0; padding:0; background:#f3f4f6; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .preview-shell { margin:16px auto; box-shadow:0 0 12px rgba(0,0,0,.08); }
  /* Many-line-item invoices must paginate cleanly across multiple physical
     pages: repeat the table header on every page, and never split a row
     (or the totals/signature block, via inline break-inside:avoid) across
     a page boundary. */
  thead { display: table-header-group; }
  tfoot { display: table-footer-group; }
  @media print {
    body{ background:white; }
    .preview-shell{ box-shadow:none; margin:0; }
    .no-print{ display:none !important; }
    table { page-break-inside: auto; }
    tr { page-break-inside: avoid; page-break-after: auto; }
  }
</style>
</head>
<body>
  <div class="no-print" style="position:fixed; top:16px; right:16px; z-index:50;">
    <button onclick="window.print()" style="background:${accent}; color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:600; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,.2);">Print / Save as PDF</button>
  </div>
  <div class="preview-shell">${fragment}</div>
</body>
</html>`;
}
