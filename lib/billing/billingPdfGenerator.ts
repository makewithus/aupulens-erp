import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { IBillingInvoice } from "@/models/billing/BillingInvoice";

// Helper to format currency values cleanly for standard PDF fonts
const formatINR = (n: number) =>
  `INR ${(Number(n) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

// Strips non-ASCII / unsupported glyphs so standard fonts never throw
const safeText = (s: string | undefined | null) =>
  (s || "").replace(/[^\x20-\x7E\xA0-\xFF]/g, " ").trim();

export async function generateInvoicePdf(invoice: IBillingInvoice | any): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.create();
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const bold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 595.28; // Standard A4 points
  const pageHeight = 841.89;
  const margin = 40;

  const page: PDFPage = pdfDoc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawText = (
    text: string,
    x: number,
    size = 9,
    fontToUse: PDFFont = font,
    color = rgb(0.12, 0.12, 0.14)
  ) => {
    page.drawText(safeText(text), { x, y, size, font: fontToUse, color });
  };

  const drawTextRight = (
    text: string,
    xRight: number,
    size = 9,
    fontToUse: PDFFont = font,
    color = rgb(0.12, 0.12, 0.14)
  ) => {
    const s = safeText(text);
    const width = fontToUse.widthOfTextAtSize(s, size);
    page.drawText(s, { x: xRight - width, y, size, font: fontToUse, color });
  };

  // Header Banner
  page.drawRectangle({
    x: margin,
    y: y - 55,
    width: pageWidth - margin * 2,
    height: 60,
    color: rgb(0.08, 0.15, 0.28), // Dark slate/navy
  });

  y -= 25;
  drawText("AUPULENS TECHNOLOGIES", margin + 16, 16, bold, rgb(1, 1, 1));
  drawTextRight("TAX INVOICE & RECEIPT", pageWidth - margin - 16, 14, bold, rgb(1, 1, 1));

  y -= 18;
  drawText("Cloud ERP & Business Management SaaS", margin + 16, 8, font, rgb(0.8, 0.85, 0.95));
  drawTextRight(`Invoice: ${invoice.invoiceNumber || "INV-SAAS"}`, pageWidth - margin - 16, 9, font, rgb(1, 1, 1));

  y -= 35;

  // Metadata Row: Dates & Receipt Number
  const metaY = y;
  page.drawRectangle({
    x: margin,
    y: metaY - 32,
    width: pageWidth - margin * 2,
    height: 36,
    color: rgb(0.96, 0.97, 0.98),
    borderColor: rgb(0.88, 0.9, 0.92),
    borderWidth: 1,
  });

  y = metaY - 14;
  drawText("Invoice Date:", margin + 12, 8, bold, rgb(0.4, 0.45, 0.5));
  drawText(new Date(invoice.invoiceDate || Date.now()).toLocaleDateString("en-IN"), margin + 75, 8, font);

  drawText("Payment Status:", margin + 160, 8, bold, rgb(0.4, 0.45, 0.5));
  drawText((invoice.status || "PAID").toUpperCase(), margin + 235, 8, bold, rgb(0.1, 0.6, 0.3));

  drawText("Receipt Number:", margin + 310, 8, bold, rgb(0.4, 0.45, 0.5));
  drawText(invoice.receiptNumber || `REC-${(invoice.invoiceNumber || "").replace("INV-", "")}`, margin + 385, 8, font);

  y = metaY - 45;

  // Two-Column: Seller Details (Left) and Customer Details (Right)
  const colWidth = (pageWidth - margin * 2 - 20) / 2;
  const sellerX = margin;
  const customerX = margin + colWidth + 20;

  // Box for Seller
  page.drawRectangle({
    x: sellerX,
    y: y - 85,
    width: colWidth,
    height: 90,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.88, 0.9, 0.92),
    borderWidth: 1,
  });

  // Box for Customer
  page.drawRectangle({
    x: customerX,
    y: y - 85,
    width: colWidth,
    height: 90,
    color: rgb(1, 1, 1),
    borderColor: rgb(0.88, 0.9, 0.92),
    borderWidth: 1,
  });

  const partyHeaderY = y - 14;
  y = partyHeaderY;
  drawText("SELLER / SERVICE PROVIDER", sellerX + 12, 8, bold, rgb(0.2, 0.3, 0.5));
  drawText("BILLED TO / CUSTOMER", customerX + 12, 8, bold, rgb(0.2, 0.3, 0.5));

  y -= 14;
  drawText(invoice.seller?.name || "Aupulens Technologies Private Limited", sellerX + 12, 9, bold);
  drawText(invoice.customer?.name || invoice.tenantId || "Valued Customer", customerX + 12, 9, bold);

  y -= 12;
  drawText(invoice.seller?.address || "Level 4, Tech Park, Outer Ring Road, Bangalore", sellerX + 12, 8, font, rgb(0.3, 0.3, 0.3));
  drawText(invoice.customer?.address || "Not specified", customerX + 12, 8, font, rgb(0.3, 0.3, 0.3));

  y -= 12;
  drawText(`GSTIN: ${invoice.seller?.gstin || "29AABCA1234F1Z5"} | State: ${invoice.seller?.state || "Karnataka"} (29)`, sellerX + 12, 8, font);
  drawText(`GSTIN: ${invoice.customer?.gstin || "Unregistered / Consumer"}`, customerX + 12, 8, font);

  y -= 12;
  drawText(`PAN: ${invoice.seller?.pan || "AABCA1234F"} | Email: ${invoice.seller?.email || "billing@aupulens.com"}`, sellerX + 12, 8, font);
  drawText(`Place of Supply: ${invoice.placeOfSupply || invoice.customer?.state || "Karnataka"}`, customerX + 12, 8, font);

  y -= 45;

  // Line Items Table Header
  const tableX = margin;
  const tableW = pageWidth - margin * 2;
  const headerHeight = 22;

  page.drawRectangle({
    x: tableX,
    y: y - headerHeight,
    width: tableW,
    height: headerHeight,
    color: rgb(0.15, 0.22, 0.35),
  });

  y -= 15;
  drawText("#", tableX + 8, 8, bold, rgb(1, 1, 1));
  drawText("Description", tableX + 30, 8, bold, rgb(1, 1, 1));
  drawTextRight("Qty", tableX + 280, 8, bold, rgb(1, 1, 1));
  drawTextRight("Unit Price", tableX + 360, 8, bold, rgb(1, 1, 1));
  drawTextRight("Taxable Value", tableX + 440, 8, bold, rgb(1, 1, 1));
  drawTextRight("Total (INR)", tableX + tableW - 10, 8, bold, rgb(1, 1, 1));

  y -= 15;

  // Render Line Items
  const items = invoice.lineItems && invoice.lineItems.length > 0
    ? invoice.lineItems
    : [
        {
          description: "Aupulens SaaS Subscription",
          qty: 1,
          unitPrice: invoice.taxableAmount || invoice.totalAmount,
          taxableValue: invoice.taxableAmount || invoice.totalAmount,
          total: invoice.totalAmount,
        },
      ];

  let itemIndex = 1;
  for (const item of items) {
    const rowHeight = 26;
    page.drawRectangle({
      x: tableX,
      y: y - rowHeight + 10,
      width: tableW,
      height: rowHeight,
      color: itemIndex % 2 === 0 ? rgb(0.98, 0.98, 0.99) : rgb(1, 1, 1),
      borderColor: rgb(0.9, 0.92, 0.94),
      borderWidth: 0.5,
    });

    drawText(String(itemIndex), tableX + 8, 8, font);
    drawText(item.description || "SaaS Plan Subscription", tableX + 30, 8, bold);
    drawTextRight(String(item.qty || 1), tableX + 280, 8, font);
    drawTextRight(formatINR(item.unitPrice || 0), tableX + 360, 8, font);
    drawTextRight(formatINR(item.taxableValue || 0), tableX + 440, 8, font);
    drawTextRight(formatINR(item.total || 0), tableX + tableW - 10, 8, bold);

    y -= rowHeight;
    itemIndex++;
  }

  y -= 15;

  // Tax Breakdown & Summary Block
  const summaryWidth = 240;
  const summaryX = tableX + tableW - summaryWidth;

  page.drawRectangle({
    x: summaryX,
    y: y - 110,
    width: summaryWidth,
    height: 110,
    color: rgb(0.98, 0.99, 1),
    borderColor: rgb(0.85, 0.88, 0.92),
    borderWidth: 1,
  });

  const sumY = y - 16;
  y = sumY;

  drawText("Taxable Subtotal:", summaryX + 12, 8, font);
  drawTextRight(formatINR(invoice.taxableAmount || 0), summaryX + summaryWidth - 12, 8, font);

  y -= 16;
  if (invoice.isInterState || (invoice.igst && invoice.igst > 0)) {
    drawText("Integrated GST (18% IGST):", summaryX + 12, 8, font);
    drawTextRight(formatINR(invoice.igst || invoice.totalTax || 0), summaryX + summaryWidth - 12, 8, font);
  } else {
    drawText("Central GST (9% CGST):", summaryX + 12, 8, font);
    drawTextRight(formatINR(invoice.cgst || 0), summaryX + summaryWidth - 12, 8, font);
    y -= 16;
    drawText("State GST (9% SGST):", summaryX + 12, 8, font);
    drawTextRight(formatINR(invoice.sgst || 0), summaryX + summaryWidth - 12, 8, font);
  }

  y -= 16;
  drawText("Total Tax Amount:", summaryX + 12, 8, bold);
  drawTextRight(formatINR(invoice.totalTax || 0), summaryX + summaryWidth - 12, 8, bold);

  y -= 18;
  page.drawLine({
    start: { x: summaryX + 10, y: y + 4 },
    end: { x: summaryX + summaryWidth - 10, y: y + 4 },
    thickness: 1,
    color: rgb(0.8, 0.85, 0.9),
  });

  drawText("TOTAL PAID:", summaryX + 12, 10, bold, rgb(0.08, 0.15, 0.28));
  drawTextRight(formatINR(invoice.totalAmount || 0), summaryX + summaryWidth - 12, 10, bold, rgb(0.08, 0.15, 0.28));

  // Payment Reference Info on the Left
  y = sumY;
  const payInfoX = tableX + 10;
  drawText("PAYMENT INFORMATION", payInfoX, 8, bold, rgb(0.3, 0.35, 0.45));
  y -= 14;
  drawText(`Payment Gateway: Razorpay (Verified)`, payInfoX, 8, font);
  y -= 12;
  drawText(`Transaction Ref: ${invoice.paymentReference || "Direct Verified Payment"}`, payInfoX, 8, font);
  y -= 12;
  drawText(`Payment Method: Electronic Mandate / Online Autopay`, payInfoX, 8, font);
  y -= 12;
  drawText(`Receipt Status: Paid in Full — No Balance Due`, payInfoX, 8, bold, rgb(0.1, 0.6, 0.3));

  // Footer notes & declarations
  y = margin + 50;
  page.drawLine({
    start: { x: margin, y: y + 10 },
    end: { x: pageWidth - margin, y: y + 10 },
    thickness: 0.5,
    color: rgb(0.8, 0.85, 0.9),
  });

  drawText("DECLARATION & TERMS:", margin, 7, bold, rgb(0.4, 0.4, 0.4));
  y -= 10;
  drawText("1. This is a computer generated tax invoice and payment receipt issued by Aupulens Technologies Private Limited.", margin, 7, font, rgb(0.4, 0.4, 0.4));
  y -= 9;
  drawText("2. The supply of software as a service (SaaS) is covered under SAC Code 998313 (Information Technology Services).", margin, 7, font, rgb(0.4, 0.4, 0.4));
  y -= 9;
  drawText("3. Applicable GST has been charged in accordance with the Central Goods and Services Tax Act and relevant State Acts.", margin, 7, font, rgb(0.4, 0.4, 0.4));
  y -= 9;
  drawText("4. For questions, invoice adjustments, or enterprise GST credits, please contact billing@aupulens.com.", margin, 7, font, rgb(0.4, 0.4, 0.4));

  return await pdfDoc.save();
}
