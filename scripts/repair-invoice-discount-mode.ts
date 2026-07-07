/**
 * Data-repair script for the quote→invoice discount-corruption bug
 * (Bug 1, test-team report): `SalesInvoice` had no `extraDiscountMode` field
 * at all, and the quote→invoice converter never carried the quote's
 * `extraDiscountMode` across — every invoice ever converted from a quote
 * with a percent-mode document-level discount (e.g. "10%") got its raw
 * numeric value (`10`) silently reinterpreted as a flat ₹ amount on the
 * invoice side (mode defaulted to "amount").
 *
 * This script finds every SalesQuotation with `convertedInvoiceId` set and
 * `extraDiscountMode: "percent"` (or a nonzero `extraDiscount` whose mode
 * doesn't match the linked invoice's), reports the mismatch, and — only
 * with --apply — re-homes the invoice's line items + discount fields from
 * the source quote (the one side guaranteed never corrupted) and recomputes
 * totals via the same shared `computeInvoiceTotals` function so both
 * documents agree to the paisa. Line items are taken from the quote rather
 * than the invoice because affected invoices may already carry a manual
 * line-level "10%" a user entered as a workaround per the bug report —
 * reusing the invoice's own (possibly patched) line items would double-count
 * that discount on top of the repaired document-level one.
 *
 * Invoices that already have a recorded payment are skipped and flagged for
 * manual review instead of auto-repaired, since rewriting line items /
 * totals underneath a real payment could desync the paid amount.
 *
 * Safe to re-run: skips invoices whose extraDiscountMode already matches
 * the source quote's. Never touches invoices with no source quote or with
 * extraDiscountMode "amount" on the quote (those were never mis-mapped).
 *
 * Usage:
 *   npx tsx scripts/repair-invoice-discount-mode.ts            # report only
 *   npx tsx scripts/repair-invoice-discount-mode.ts --apply     # repair
 */
import "dotenv/config";
import connectDB from "../lib/db";
import SalesQuotation from "../models/SalesQuotation";
import { SalesInvoice } from "../models/SalesInvoice";
import Organization from "../models/Organization";
import { computeInvoiceTotals } from "../lib/sales/invoiceMath";

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  const quotes = await SalesQuotation.find({
    convertedInvoiceId: { $exists: true, $ne: null },
  }).lean();

  let mismatches = 0;
  let repaired = 0;

  for (const quote of quotes) {
    const invoice = await (SalesInvoice as any).findOne({ _id: quote.convertedInvoiceId, tenantId: quote.tenantId });
    if (!invoice) continue;

    const quoteMode = quote.extraDiscountMode || "amount";
    const invoiceMode = invoice.extraDiscountMode || "amount";

    if (quoteMode === invoiceMode) continue;
    if (!quote.extraDiscount) continue; // no discount was actually set — mode mismatch is harmless

    mismatches++;
    console.log(
      `[MISMATCH] Invoice ${invoice.number} (${invoice._id}) from Quote ${quote.quoteNumber}: ` +
        `quote extraDiscount=${quote.extraDiscount} mode=${quoteMode}, ` +
        `invoice extraDiscount=${invoice.extraDiscount} mode=${invoiceMode}, ` +
        `invoice totalAmount=${invoice.totalAmount} (quote totalAmount=${quote.totalAmount})`
    );

    if (!apply) continue;

    if (Array.isArray(invoice.payments) && invoice.payments.length > 0) {
      console.log(`  -> SKIPPED (has ${invoice.payments.length} recorded payment(s) — needs manual review)`);
      continue;
    }

    const org = await Organization.findOne({ subdomain: invoice.tenantId }).lean();
    const sellerState = (org as any)?.settings?.state;

    // Re-home line items + discount fields from the quote (guaranteed
    // uncorrupted source) rather than trusting the invoice's own, possibly
    // manually-patched, line items.
    const quoteLineItems = (quote.lineItems || []).map((li: any) => ({
      itemId: li.itemId,
      name: li.name,
      description: li.description,
      qty: li.qty,
      unitPrice: li.unitPrice,
      discount: li.discount,
      discountMode: li.discountMode,
      taxRate: li.taxRate,
      hsn: li.hsn,
    }));

    const totals = computeInvoiceTotals({
      lineItems: quoteLineItems,
      itemLevelDiscountPercent: quote.itemLevelDiscountPercent || 0,
      additionalCharges: invoice.additionalCharges || [],
      extraDiscount: quote.extraDiscount,
      extraDiscountMode: quoteMode,
      roundOff: !!invoice.roundOff,
      sellerState,
      placeOfSupply: invoice.placeOfSupply,
      tdsRate: invoice.taxes?.tds || 0,
      tcsRate: invoice.taxes?.tcs || 0,
    });

    invoice.lineItems = quoteLineItems.map((li: any, i: number) => ({
      ...li,
      lineTotal: totals.computedLines[i].lineTotal,
    })) as any;
    invoice.itemLevelDiscountPercent = quote.itemLevelDiscountPercent || 0;
    invoice.extraDiscount = quote.extraDiscount;
    invoice.extraDiscountMode = quoteMode;
    invoice.taxableAmount = totals.taxableAmount;
    invoice.totalDiscount = totals.totalDiscount;
    invoice.totalAmount = totals.totalAmount;
    invoice.taxes.gstBreakup = totals.gstBreakup;
    await invoice.save();
    repaired++;
    console.log(`  -> repaired: extraDiscountMode=${quoteMode}, totalAmount=${totals.totalAmount}`);
  }

  console.log(`\nDone. ${mismatches} mismatched invoice(s) found${apply ? `, ${repaired} repaired.` : "."}`);
  if (!apply && mismatches > 0) {
    console.log("Re-run with --apply to repair.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
