/**
 * One-off migration: backfills lineItems[].lineTotal on existing SalesInvoice
 * documents that were created before app/api/sales/invoices/route.ts and
 * [id]/route.ts computed it server-side.
 *
 * Root cause (found live from a QA screenshot: "SalesInvoice validation
 * failed: lineItems.0.lineTotal: Path `lineTotal` is required" both on
 * saving a new invoice and on recording a payment against an existing one):
 * InvoiceForm.tsx never included lineTotal in the payload it sent (it only
 * ever computed it client-side for display), and neither invoice route ever
 * computed/injected it before this fix — so any invoice actually created
 * through the real UI has a line item schema-required field silently
 * missing. Mongoose only enforces `required` at write time, so these
 * documents sat in the database untouched until the *next* write (e.g.
 * lib/sales/paymentAllocation.ts's applyAllocationsToInvoices calling
 * invoice.save() while recording a payment), which re-validates the whole
 * document and fails.
 *
 * Recomputes lineTotal using the exact same formula as lib/sales/invoiceMath.ts's
 * computeLine (taxableValue + taxAmount, after line + item-level discount).
 *
 * Safe to run multiple times (only touches lines where lineTotal is missing
 * or exactly 0 while gross line value is nonzero — the same signature the
 * bug leaves behind; a genuinely free/zero-value line stays 0 either way).
 *
 * Usage: npx tsx scripts/migrate-backfill-invoice-line-totals.ts
 */
import "dotenv/config";
import connectDB from "../lib/db";
import { SalesInvoice } from "../models/SalesInvoice";

function computeLineTotal(li: any, itemLevelDiscountPercent = 0): number {
  const qty = Number(li.qty) || 0;
  const unitPrice = Number(li.unitPrice) || 0;
  const gross = qty * unitPrice;
  const discount = Number(li.discount) || 0;
  const lineDiscountAmount = li.discountMode === "percent" ? (gross * discount) / 100 : Math.min(discount, gross);
  const afterLineDiscount = gross - lineDiscountAmount;
  const globalDiscountAmount = itemLevelDiscountPercent ? (afterLineDiscount * itemLevelDiscountPercent) / 100 : 0;
  const taxableValue = Math.max(0, afterLineDiscount - globalDiscountAmount);
  const taxRate = Number(li.taxRate) || 0;
  const taxAmount = (taxableValue * taxRate) / 100;
  return Math.round((taxableValue + taxAmount) * 100) / 100;
}

async function main() {
  await connectDB();

  const invoices = await (SalesInvoice as any).find({
    $or: [
      { "lineItems.lineTotal": { $exists: false } },
      { lineItems: { $elemMatch: { lineTotal: 0, qty: { $gt: 0 }, unitPrice: { $gt: 0 } } } },
    ],
  });

  console.log(`Found ${invoices.length} invoice(s) with a suspect lineTotal.`);

  let fixed = 0;
  for (const invoice of invoices) {
    let changed = false;
    for (const li of invoice.lineItems as any[]) {
      const recomputed = computeLineTotal(li, invoice.itemLevelDiscountPercent || 0);
      if (li.lineTotal === undefined || (li.lineTotal === 0 && recomputed !== 0)) {
        li.lineTotal = recomputed;
        changed = true;
      }
    }
    if (changed) {
      await invoice.save();
      fixed += 1;
      console.log(`  Fixed ${invoice.number} (tenant ${invoice.tenantId}).`);
    }
  }

  console.log(`Done. Backfilled lineTotal on ${fixed} invoice(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
