import type { TemplateDefinition, TemplateRenderContext } from "./types";
import { escapeHtml, fmtNum, money, dateStr } from "./helpers";

const FONT_STACK: Record<string, string> = {
  sans: "'Inter', 'Helvetica Neue', Arial, sans-serif",
  serif: "'Merriweather', 'Georgia', serif",
  mono: "'Roboto Mono', monospace",
};

function borderCss(def: TemplateDefinition, accent: string): string {
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

function tableBorderCss(def: TemplateDefinition): string {
  if (def.borderStyle === "heavy-grid" || def.borderStyle === "double") {
    return `border: 1px solid #333;`;
  }
  if (def.borderStyle === "thin") {
    return `border: 1px solid #e5e7eb;`;
  }
  return "border: none;";
}

function cellBorderCss(def: TemplateDefinition): string {
  if (def.borderStyle === "heavy-grid" || def.borderStyle === "double") {
    return `border: 1px solid #333;`;
  }
  return `border-bottom: 1px solid #e5e7eb;`;
}

function buildHeaderBlock(def: TemplateDefinition, ctx: TemplateRenderContext, accent: string): string {
  const { company, settings, invoice } = ctx;
  const titleWord = ctx.documentType === "purchase" ? "PURCHASE BILL" : ctx.documentType === "quotation" ? "QUOTATION" : "TAX INVOICE";
  const logoImg = settings.showImages && company.logo ? `<img src="${escapeHtml(company.logo)}" alt="logo" style="max-height:56px;max-width:160px;object-fit:contain;" />` : "";

  if (def.headerStyle === "gradient-band") {
    return `
      <div style="background: linear-gradient(120deg, ${accent}, #111827); color: white; padding: 28px 32px; border-radius: 16px; margin-bottom: 24px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <div style="font-size: 28px; font-weight: 800; letter-spacing: 1px;">${titleWord}</div>
          <div style="opacity:.85; margin-top:4px;">#${escapeHtml(invoice.number)}</div>
        </div>
        <div style="text-align:right;">
          ${logoImg}
          <div style="font-size:18px; font-weight:700; margin-top:4px;">${escapeHtml(company.name)}</div>
        </div>
      </div>`;
  }

  if (def.headerStyle === "centered") {
    return `
      <div style="text-align:center; padding-bottom:16px; margin-bottom:24px; border-bottom: 1px solid ${accent};">
        ${logoImg}
        <div style="font-size:22px; font-weight:700; letter-spacing:2px; color:${accent}; margin-top:8px;">${escapeHtml(company.name)}</div>
        <div style="font-size:13px; color:#6b7280; margin-top:6px; text-transform:uppercase; letter-spacing:3px;">${titleWord} &middot; #${escapeHtml(invoice.number)}</div>
      </div>`;
  }

  if (def.headerStyle === "bordered-grid") {
    return `
      <div style="${borderCss(def, accent)} padding:16px 20px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          ${logoImg}
          <div style="font-size:20px; font-weight:700;">${escapeHtml(company.name)}</div>
          ${company.gstin ? `<div style="font-size:11px;color:#555;">GSTIN: ${escapeHtml(company.gstin)}</div>` : ""}
        </div>
        <div style="text-align:right;">
          <div style="font-size:20px; font-weight:800; letter-spacing:1px;">${titleWord}</div>
          <div style="font-size:12px; color:#555;"># ${escapeHtml(invoice.number)}</div>
        </div>
      </div>`;
  }

  if (def.headerStyle === "sidebar") {
    return `
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:20px;">
        <div>
          <div style="font-size:24px; font-weight:800; color:${accent};">${titleWord}</div>
          <div style="font-size:12px; color:#6b7280;"># ${escapeHtml(invoice.number)}</div>
        </div>
        <div style="text-align:right;">
          ${logoImg}
          <div style="font-size:16px; font-weight:700;">${escapeHtml(company.name)}</div>
        </div>
      </div>`;
  }

  if (def.headerStyle === "dual-address") {
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px; padding-bottom:16px; border-bottom: 2px solid ${accent};">
        <div>
          ${logoImg}
          <div style="font-size:20px; font-weight:700;">${escapeHtml(company.name)}</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:22px; font-weight:800; color:${accent};">${titleWord}</div>
          <div style="font-size:12px; color:#6b7280;"># ${escapeHtml(invoice.number)}</div>
        </div>
      </div>`;
  }

  // minimal (default)
  return `
    <div style="display:flex; justify-content:space-between; align-items:flex-start; border-bottom: 2px solid ${accent}; padding-bottom: 20px; margin-bottom: 28px;">
      <div>
        <div style="font-size:32px; font-weight:800; text-transform:uppercase; letter-spacing:2px; color:${accent};">${titleWord}</div>
        <div style="color:#6b7280; margin-top:6px; font-weight:500;"># ${escapeHtml(invoice.number)}</div>
      </div>
      <div style="text-align:right;">
        ${logoImg}
        <div style="font-size:20px; font-weight:700;">${escapeHtml(company.name)}</div>
        ${company.gstin ? `<div style="font-size:11px;color:#6b7280;">GSTIN: ${escapeHtml(company.gstin)}</div>` : ""}
      </div>
    </div>`;
}

function addressBox(title: string, name: string, lines: (string | undefined)[], gstin?: string): string {
  const body = lines.filter(Boolean).join("<br/>");
  return `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px; flex:1;">
      <p style="font-size:11px;text-transform:uppercase;letter-spacing:1px;color:#9ca3af;font-weight:700;margin:0 0 6px;">${escapeHtml(title)}</p>
      <p style="font-weight:700;margin:0 0 4px;">${escapeHtml(name)}</p>
      <p style="font-size:12px;color:#6b7280;margin:0;">${body}</p>
      ${gstin ? `<p style="font-size:11px;color:#9ca3af;margin:6px 0 0;">GSTIN: ${escapeHtml(gstin)}</p>` : ""}
    </div>`;
}

function buildPartyAndMetaBlock(def: TemplateDefinition, ctx: TemplateRenderContext): string {
  const { customer, invoice, settings } = ctx;
  const billTo = addressBox("Bill To", customer.name, [customer.billingAddress, customer.email, customer.phone], customer.gstin);
  const shipTo =
    def.billShipProminent || settings.showDispatchAddress
      ? addressBox("Ship To", customer.name, [customer.shippingAddress || customer.billingAddress])
      : "";

  const metaRows = [
    { label: ctx.documentType === "quotation" ? "Quotation Date" : "Invoice Date", value: dateStr(invoice.invoiceDate) },
    settings.showDueDate ? { label: "Due Date", value: dateStr(invoice.dueDate) } : null,
    invoice.reference ? { label: "Reference", value: invoice.reference } : null,
    { label: "Type", value: invoice.type },
    invoice.placeOfSupply ? { label: "Place of Supply", value: invoice.placeOfSupply } : null,
  ].filter(Boolean) as { label: string; value: string }[];

  const metaHtml = `
    <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px; min-width:220px;">
      ${metaRows
        .map(
          (r) => `
        <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0; ${
          r !== metaRows[metaRows.length - 1] ? "border-bottom:1px dashed #eee;" : ""
        }">
          <span style="color:#6b7280;">${escapeHtml(r.label)}</span>
          <span style="font-weight:600;">${escapeHtml(r.value)}</span>
        </div>`,
        )
        .join("")}
    </div>`;

  return `
    <div style="display:flex; gap:16px; margin-bottom:24px; align-items:stretch;">
      ${billTo}
      ${shipTo}
      ${metaHtml}
    </div>`;
}

function buildItemsTable(def: TemplateDefinition, ctx: TemplateRenderContext): string {
  const { computedLines, settings } = ctx;
  const decimals = settings.priceDecimals ?? 2;
  const qtyDecimals = settings.showQuantity3Decimals ? 3 : 0;
  const striped = settings.showStripedRows;
  const dense = def.density === "compact";
  const pad = dense ? "6px 8px" : "10px 12px";

  const cols: string[] = ["#"];
  if (def.showImages) cols.push("");
  cols.push(def.serviceStyle ? "Description" : "Item &amp; Description");
  if (!settings.hideHsn && !def.serviceStyle) cols.push("HSN/SAC");
  if (!settings.hideQuantity) cols.push("Qty");
  if (settings.showQuantityConversionRate) cols.push("Conv. Rate");
  if (def.showMrpColumn) cols.push("MRP");
  cols.push("Rate");
  if (!settings.hideDiscount && settings.showDiscountColumn) cols.push("Discount");
  cols.push("Tax %");
  cols.push("Amount");

  const headHtml = settings.enableItemHeaders
    ? `<thead><tr style="background:${def.headerStyle === "gradient-band" ? "#111827" : ctx.settings.accentColor}; color:white;">
        ${cols.map((c) => `<th style="padding:${pad}; font-size:11px; text-transform:uppercase; letter-spacing:.5px; text-align:${c === "Amount" || c === "Rate" || c === "MRP" ? "right" : "left"};">${c}</th>`).join("")}
      </tr></thead>`
    : "";

  const rows = computedLines
    .map((line, i) => {
      const bg = striped && i % 2 === 1 ? "background:#f9fafb;" : "";
      const cells: string[] = [`<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:12px; color:#6b7280;">${i + 1}</td>`];
      if (def.showImages) {
        cells.push(`<td style="padding:${pad}; ${cellBorderCss(def)} ${bg}"><div style="width:32px;height:32px;border-radius:6px;background:#f3f4f6;"></div></td>`);
      }
      cells.push(
        `<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:13px; font-weight:600;">${escapeHtml(line.name || "Item")}</td>`,
      );
      if (!settings.hideHsn && !def.serviceStyle) {
        cells.push(`<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:12px; color:#6b7280;">${escapeHtml(line.hsn || "-")}</td>`);
      }
      if (!settings.hideQuantity) {
        cells.push(`<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:12px; text-align:center;">${fmtNum(line.qty, qtyDecimals)}</td>`);
      }
      if (settings.showQuantityConversionRate) {
        cells.push(`<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:12px; text-align:center;">1</td>`);
      }
      if (def.showMrpColumn) {
        cells.push(`<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:12px; text-align:right;">${fmtNum(line.unitPrice, decimals)}</td>`);
      }
      cells.push(`<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:12px; text-align:right;">${fmtNum(line.unitPrice, decimals)}</td>`);
      if (!settings.hideDiscount && settings.showDiscountColumn) {
        cells.push(
          `<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:12px; text-align:right;">${
            line.discount ? `${fmtNum(line.discount, 2)}${line.discountMode === "percent" ? "%" : ""}` : "-"
          }</td>`,
        );
      }
      cells.push(`<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:12px; text-align:right;">${fmtNum(line.taxRate, 0)}%</td>`);
      cells.push(`<td style="padding:${pad}; ${cellBorderCss(def)} ${bg} font-size:13px; text-align:right; font-weight:700;">${fmtNum(line.lineTotal, decimals)}</td>`);
      return `<tr>${cells.join("")}</tr>`;
    })
    .join("");

  return `
    <table style="width:100%; border-collapse:collapse; margin-bottom:20px; ${tableBorderCss(def)}">
      ${headHtml}
      <tbody>${rows}</tbody>
    </table>`;
}

function buildTotalsBlock(ctx: TemplateRenderContext, accent: string): string {
  const { totals, settings } = ctx;
  const decimals = settings.priceDecimals ?? 2;
  const row = (label: string, value: string, bold = false) => `
    <div style="display:flex; justify-content:space-between; padding:5px 0; ${bold ? "font-weight:700;" : "color:#4b5563;"} font-size:${bold ? "13px" : "12px"};">
      <span>${escapeHtml(label)}</span><span>${value}</span>
    </div>`;

  let rows = row("Subtotal", money(totals.subtotal, decimals));
  if (totals.totalDiscount) rows += row("Total Discount", `- ${money(totals.totalDiscount, decimals)}`);
  rows += row("Taxable Amount", money(totals.taxableAmount, decimals), true);
  for (const g of totals.gstBreakup) {
    if (g.label === "TDS") {
      rows += row("TDS", `- ${money(Math.abs(g.amount), decimals)}`);
    } else {
      rows += row(g.label, money(g.amount, decimals));
    }
  }
  if (settings.showRoundOff && totals.roundOffAmount) {
    rows += row("Round Off", money(totals.roundOffAmount, decimals));
  }

  return `
    <div style="background:#f9fafb; border-radius:12px; padding:18px 20px; min-width:280px;">
      ${rows}
      <div style="display:flex; justify-content:space-between; border-top:2px solid ${accent}; margin-top:10px; padding-top:10px;">
        <span style="font-size:16px; font-weight:800;">Total</span>
        <span style="font-size:20px; font-weight:900; color:${accent};">${money(totals.totalAmount, decimals)}</span>
      </div>
    </div>`;
}

function buildHsnSummaryTable(ctx: TemplateRenderContext): string {
  const { hsnSummary, settings, documentType } = ctx;
  if (!settings.showHsnSummary || !settings.showHsnSummaryOn?.includes(documentType) || hsnSummary.length === 0) return "";
  const decimals = settings.priceDecimals ?? 2;
  const rows = hsnSummary
    .map(
      (r) => `
    <tr>
      <td style="padding:8px; border-bottom:1px solid #eee; font-size:12px;">${escapeHtml(r.hsn)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">${fmtNum(r.taxableValue, decimals)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">${fmtNum(r.cgstAmount, decimals)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">${fmtNum(r.sgstAmount, decimals)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; font-size:12px; text-align:right;">${fmtNum(r.igstAmount, decimals)}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; font-size:12px; text-align:right; font-weight:600;">${fmtNum(r.total, decimals)}</td>
    </tr>`,
    )
    .join("");

  return `
    <div style="margin:24px 0;">
      <p style="font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.5px; margin-bottom:8px;">HSN/SAC Summary</p>
      <table style="width:100%; border-collapse:collapse;">
        <thead><tr style="background:#f3f4f6;">
          <th style="padding:8px; font-size:11px; text-align:left;">HSN/SAC</th>
          <th style="padding:8px; font-size:11px; text-align:right;">Taxable Value</th>
          <th style="padding:8px; font-size:11px; text-align:right;">CGST</th>
          <th style="padding:8px; font-size:11px; text-align:right;">SGST</th>
          <th style="padding:8px; font-size:11px; text-align:right;">IGST</th>
          <th style="padding:8px; font-size:11px; text-align:right;">Total</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function buildBankAndQrBlock(ctx: TemplateRenderContext): string {
  const { bank, upiQrDataUrl, settings } = ctx;
  if (!settings.showPayments || (!bank && !upiQrDataUrl)) return "";
  return `
    <div style="display:flex; gap:20px; align-items:flex-start; margin-top:20px;">
      ${
        bank
          ? `<div style="font-size:12px; color:#4b5563;">
              <p style="font-weight:700; margin:0 0 4px;">Bank Details</p>
              <p style="margin:0;">${escapeHtml(bank.accountName)}</p>
              ${bank.bankName ? `<p style="margin:0;">${escapeHtml(bank.bankName)}</p>` : ""}
              ${bank.accountNumber ? `<p style="margin:0;">A/C: ${escapeHtml(bank.accountNumber)}</p>` : ""}
              ${bank.ifsc ? `<p style="margin:0;">IFSC: ${escapeHtml(bank.ifsc)}</p>` : ""}
            </div>`
          : ""
      }
      ${
        upiQrDataUrl
          ? `<div style="text-align:center;">
              <img src="${upiQrDataUrl}" alt="UPI QR" style="width:96px;height:96px;" />
              <p style="font-size:10px; color:#6b7280; margin:4px 0 0;">Scan to pay via UPI</p>
            </div>`
          : ""
      }
    </div>`;
}

function buildPaymentsBlock(ctx: TemplateRenderContext): string {
  const { invoice, settings } = ctx;
  if (!settings.showPayments || !invoice.payments?.length) return "";
  const rows = invoice.payments
    .map(
      (p) => `
    <div style="display:flex; justify-content:space-between; font-size:11px; padding:3px 0; color:#4b5563;">
      <span>${dateStr(p.date)} &middot; ${escapeHtml(p.mode)}</span><span>${money(p.amount, settings.priceDecimals ?? 2)}</span>
    </div>`,
    )
    .join("");
  return `
    <div style="margin-top:14px;">
      <p style="font-size:11px; font-weight:700; text-transform:uppercase; color:#9ca3af; margin:0 0 4px;">Payments ${invoice.markedFullyPaid ? "&middot; Fully Paid" : ""}</p>
      ${rows}
    </div>`;
}

function buildSignatureBlock(ctx: TemplateRenderContext): string {
  if (!ctx.settings.showReceiverSignature) return "";
  return `
    <div style="margin-top:40px; text-align:right;">
      ${ctx.signatureUrl ? `<img src="${escapeHtml(ctx.signatureUrl)}" style="height:48px; margin-bottom:6px;" />` : ""}
      <div style="width:180px; margin-left:auto; border-top:1px solid #9ca3af; padding-top:6px; font-size:11px; color:#6b7280;">Authorized Signatory</div>
    </div>`;
}

export function renderInvoiceTemplate(def: TemplateDefinition, ctx: TemplateRenderContext): string {
  const accent = ctx.settings.accentColor || def.accentColorDefault;
  const font = FONT_STACK[def.fontFamily];
  const fontSizePx = ctx.settings.pdfFontSize === "Small" ? 12 : ctx.settings.pdfFontSize === "Large" ? 16 : 14;
  const pageSize = def.orientation === "landscape" ? "297mm 210mm" : "210mm 297mm";
  const pageWidth = def.orientation === "landscape" ? "297mm" : "210mm";

  const header = buildHeaderBlock(def, ctx, accent);
  const party = buildPartyAndMetaBlock(def, ctx);
  const items = buildItemsTable(def, ctx);
  const hsnSummary = buildHsnSummaryTable(ctx);
  const totals = buildTotalsBlock(ctx, accent);
  const bankQr = buildBankAndQrBlock(ctx);
  const payments = buildPaymentsBlock(ctx);
  const signature = buildSignatureBlock(ctx);

  const notesTerms = `
    <div style="max-width:55%;">
      ${ctx.invoice.notes ? `<div style="margin-bottom:14px;"><p style="font-size:11px; font-weight:700; text-transform:uppercase; color:#9ca3af; margin:0 0 4px;">Notes</p><p style="font-size:12px; color:#4b5563; margin:0;">${escapeHtml(ctx.invoice.notes)}</p></div>` : ""}
      ${ctx.invoice.terms ? `<div><p style="font-size:11px; font-weight:700; text-transform:uppercase; color:#9ca3af; margin:0 0 4px;">Terms &amp; Conditions</p><p style="font-size:11px; color:#6b7280; margin:0;">${escapeHtml(ctx.invoice.terms)}</p></div>` : ""}
      ${payments}
      ${bankQr}
    </div>`;

  const amountInWordsBlock = `
    <p style="font-size:11px; color:#6b7280; margin:10px 0 0;"><strong>Amount in Words:</strong> ${escapeHtml(ctx.amountInWords)}</p>`;

  const mainBody =
    def.headerStyle === "sidebar"
      ? `
      <div style="display:flex; gap:24px;">
        <div style="flex:1;">
          ${party}
          ${items}
          ${hsnSummary}
          <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:20px;">
            ${notesTerms}
          </div>
        </div>
        <div style="width:220px;">
          ${totals}
          ${amountInWordsBlock}
          ${signature}
        </div>
      </div>`
      : `
      ${party}
      ${items}
      ${hsnSummary}
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-top:20px; gap:24px;">
        ${notesTerms}
        <div>
          ${totals}
          ${amountInWordsBlock}
        </div>
      </div>
      ${signature}`;

  const eDocBadges = [ctx.invoice.eWaybill ? "E-Waybill" : null, ctx.invoice.eInvoice ? "E-Invoice" : null]
    .filter(Boolean)
    .map((b) => `<span style="display:inline-block; background:${accent}1a; color:${accent}; font-size:10px; font-weight:700; padding:2px 8px; border-radius:6px; margin-left:6px;">${b}</span>`)
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(ctx.invoice.number)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Roboto+Mono&family=Merriweather:wght@400;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; }
  @page { size: ${pageSize}; margin: 0; }
  body { margin:0; padding:0; background:#f3f4f6; font-family:${font}; font-size:${fontSizePx}px; color:#111827; -webkit-print-color-adjust:exact; print-color-adjust:exact; }
  .page { width:${pageWidth}; min-height:${def.orientation === "landscape" ? "210mm" : "297mm"}; margin:16px auto; background:white; box-shadow:0 0 12px rgba(0,0,0,.08); padding:${ctx.settings.marginTop}px ${ctx.settings.marginRight}px ${ctx.settings.marginBottom}px ${ctx.settings.marginLeft}px; position:relative; }
  @media print { body{ background:white; } .page{ box-shadow:none; margin:0; width:auto; min-height:auto; } .no-print{ display:none !important; } }
</style>
</head>
<body>
  <div class="no-print" style="position:fixed; top:16px; right:16px; z-index:50;">
    <button onclick="window.print()" style="background:${accent}; color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:600; cursor:pointer; box-shadow:0 4px 10px rgba(0,0,0,.2);">Print / Save as PDF</button>
  </div>
  <div class="page">
    ${ctx.settings.bannerTopUrl ? `<img src="${escapeHtml(ctx.settings.bannerTopUrl)}" style="width:100%; margin-bottom:16px;" />` : ""}
    ${ctx.settings.watermarkUrl ? `<img src="${escapeHtml(ctx.settings.watermarkUrl)}" style="position:absolute; opacity:.06; top:35%; left:15%; width:70%; z-index:0;" />` : ""}
    <div style="position:relative; z-index:1;">
      ${ctx.settings.headerImageUrl ? `<img src="${escapeHtml(ctx.settings.headerImageUrl)}" style="width:100%; margin-bottom:12px;" />` : ""}
      ${header}
      ${eDocBadges ? `<div style="margin:-16px 0 20px;">${eDocBadges}</div>` : ""}
      ${mainBody}
      ${ctx.settings.footerImageUrl ? `<img src="${escapeHtml(ctx.settings.footerImageUrl)}" style="width:100%; margin-top:20px;" />` : ""}
      <div style="margin-top:32px; padding-top:14px; border-top:1px solid #e5e7eb; text-align:center; font-size:10px; color:#9ca3af;">
        ${ctx.settings.pdfFooterText ? `<p style="margin:0 0 4px;">${escapeHtml(ctx.settings.pdfFooterText)}</p>` : ""}
        <p style="margin:0;">This is a digitally signed document and does not require a physical signature.</p>
      </div>
      ${ctx.settings.bannerBottomUrl ? `<img src="${escapeHtml(ctx.settings.bannerBottomUrl)}" style="width:100%; margin-top:12px;" />` : ""}
    </div>
  </div>
</body>
</html>`;
}
