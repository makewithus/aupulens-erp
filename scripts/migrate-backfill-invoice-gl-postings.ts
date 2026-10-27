/**
 * One-off migration: retroactively posts revenue/receivable/tax journal
 * entries for existing non-draft SalesInvoice documents that predate the
 * Issue #9 fix (lib/accounting/salesInvoicePosting.ts) — i.e. that have
 * `journalEntryIds` empty even though they're saved/paid/overdue/
 * partially_paid.
 *
 * That fix made invoice create/edit post to the GL going forward, but
 * never touched historical data — every invoice created before it shipped
 * (potentially already marked "paid" via the payment-side posting, which
 * only ever moved Bank/AR, never Revenue) has cashflow correctly reflected
 * but zero revenue, which is exactly the reported "cashflow updates but
 * revenue stays zero" / "P&L never updates" symptom for pre-existing data.
 *
 * Derives the {taxableAmount, totalTax, tcsAmount, tdsAmount} snapshot
 * from the invoice's own already-stored fields (taxableAmount directly,
 * the rest from taxes.gstBreakup) rather than recomputing from lineItems —
 * this guarantees the backfilled posting exactly matches what's already
 * displayed on the invoice/PDF, with no dependency on Organization/seller-
 * state context that may have changed since the invoice was created.
 *
 * Safe to run multiple times (skips any invoice that already has a
 * postedSnapshot / journalEntryIds — postSalesInvoiceJournal's own diff
 * logic is also idempotent on top of that).
 *
 * Usage: npx tsx scripts/migrate-backfill-invoice-gl-postings.ts
 */
import "dotenv/config";
import { SALES_INVOICE_STATUS } from "../lib/constants/statuses";
import connectDB from "../lib/db";
import { SalesInvoice } from "../models/sales/SalesInvoice";
import { postSalesInvoiceJournal } from "../lib/accounting/salesInvoicePosting";
import User from "../models/auth/User";
import mongoose from "mongoose";

const REVENUE_RECOGNIZED_STATUSES: string[] = [
  SALES_INVOICE_STATUS.SAVED,
  SALES_INVOICE_STATUS.PARTIALLY_PAID,
  SALES_INVOICE_STATUS.PAID,
  SALES_INVOICE_STATUS.OVERDUE,
];

function deriveSnapshot(invoice: any) {
  const breakup: { label: string; amount: number }[] = invoice.taxes?.gstBreakup || [];
  const totalTax = breakup
    .filter((b) => ["CGST", "SGST", "IGST"].includes(b.label))
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);
  const tcsAmount = breakup.find((b) => b.label === "TCS")?.amount || 0;
  const tdsAmount = Math.abs(breakup.find((b) => b.label === "TDS")?.amount || 0);

  return {
    taxableAmount: Number(invoice.taxableAmount) || 0,
    totalTax,
    tcsAmount: Number(tcsAmount) || 0,
    tdsAmount: Number(tdsAmount) || 0,
  };
}

async function main() {
  await connectDB();

  const invoices = await (SalesInvoice as any).find({
    status: { $in: REVENUE_RECOGNIZED_STATUSES },
    $or: [{ journalEntryIds: { $exists: false } }, { journalEntryIds: { $size: 0 } }],
  });

  console.log(`Found ${invoices.length} non-draft invoice(s) with no GL posting.`);

  let posted = 0;
  let skipped = 0;
  const failures: { number: string; tenantId: string; error: string }[] = [];
  // Fallback createdBy per tenant, for the handful of legacy invoices whose
  // own createdBy was never set (seed data, pre-dating that field) — an
  // active admin for that tenant, resolved lazily and cached.
  const tenantAdminCache = new Map<string, string | null>();
  async function fallbackCreatedBy(tenantId: string): Promise<string | null> {
    if (tenantAdminCache.has(tenantId)) return tenantAdminCache.get(tenantId)!;
    const admin = await (User as any)
      .findOne({ tenantId, role: "admin", status: "active" })
      .select("_id")
      .lean();
    const id = admin ? String(admin._id) : null;
    tenantAdminCache.set(tenantId, id);
    return id;
  }

  for (const invoice of invoices) {
    const snapshot = deriveSnapshot(invoice);
    if (Math.abs(snapshot.taxableAmount) < 0.005) {
      skipped += 1;
      continue; // nothing real to post (e.g. a zero-value invoice)
    }
    try {
      let createdBy = mongoose.Types.ObjectId.isValid(String(invoice.createdBy || ""))
        ? String(invoice.createdBy)
        : null;
      if (!createdBy) {
        createdBy = await fallbackCreatedBy(invoice.tenantId);
        if (!createdBy) throw new Error("No active admin user found for tenant to attribute this posting to.");
      }
      const journalId = await postSalesInvoiceJournal({
        invoice,
        tenantId: invoice.tenantId,
        createdBy,
        current: snapshot,
      });
      if (journalId) {
        await invoice.save();
        posted += 1;
        console.log(`  Posted ${invoice.number} (tenant ${invoice.tenantId}), taxableAmount=${snapshot.taxableAmount}`);
      } else {
        skipped += 1;
      }
    } catch (error: any) {
      failures.push({ number: invoice.number, tenantId: invoice.tenantId, error: error.message });
      console.error(`  FAILED ${invoice.number} (tenant ${invoice.tenantId}): ${error.message}`);
    }
  }

  console.log(`\nDone. Posted ${posted}, skipped ${skipped} (zero-value or already posted), ${failures.length} failure(s).`);
  if (failures.length) {
    console.log("Failures (likely missing Chart of Accounts for that tenant — visit Chart of Accounts once for it, then re-run this script):");
    failures.forEach((f) => console.log(`  ${f.number} (${f.tenantId}): ${f.error}`));
  }

  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
