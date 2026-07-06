/**
 * One-off migration: `models/Bill.ts` was an orphaned, disconnected schema —
 * the real Vendor Bills screen (app/finance/bills/page.tsx) has always read
 * from `models/Invoice.ts` with `moveType: "in_invoice"`. A prior seed pass
 * accidentally created 2 demo bills in the dead `bills` collection instead
 * of the real one, where they were invisible to the actual Vendor Bills UI
 * and to the Admin Dashboard's "Total Expenses" KPI (found during the
 * QA_GAP_REPORT.md remediation pass, item #15).
 *
 * This migrates each orphaned `bills` document into a real Invoice
 * (moveType: "in_invoice") document, attaching it to an existing Customer
 * as its vendor partner (Bill.ts stored vendor identity as a free-text
 * name, not a real ref — this app's own PurchaseOrder.partnerId already
 * uses Customer docs to represent vendors, so this follows the same
 * pattern). Skips any orphaned doc whose billNumber already exists as an
 * Invoice.name in the same tenant (defensive; none expected). Does not
 * delete the source `bills` collection — safe to re-run, and leaves the
 * original rows for manual review until someone confirms the migration
 * looks right.
 *
 * Usage: npx tsx scripts/migrate-bill-split-brain.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import Invoice from "../models/Invoice";
import Customer from "../models/Customer";

async function main() {
  await connectDB();
  const db = mongoose.connection.db!;
  const orphaned = await db.collection("bills").find({}).toArray();

  if (orphaned.length === 0) {
    console.log("No orphaned Bill.ts documents found. Nothing to migrate.");
    await mongoose.disconnect();
    return;
  }

  console.log(`Found ${orphaned.length} orphaned bill(s) to migrate.`);

  for (const bill of orphaned) {
    const existing = await Invoice.findOne({ tenantId: bill.tenantId, name: bill.billNumber });
    if (existing) {
      console.log(`  ${bill.billNumber}: an Invoice with this name already exists, skipping.`);
      continue;
    }

    const vendor = await Customer.findOne({ tenantId: bill.tenantId }).sort({ createdAt: 1 });
    if (!vendor) {
      console.log(`  ${bill.billNumber}: no Customer exists in tenant "${bill.tenantId}" to attach as vendor, skipping.`);
      continue;
    }

    const amountTotal = Number(bill.total) || 0;
    const amountUntaxed = Number(bill.subtotal) || amountTotal;
    const amountTax = Number(bill.taxAmount) || 0;

    await Invoice.create({
      tenantId: bill.tenantId,
      name: bill.billNumber,
      partnerId: vendor._id,
      invoiceDate: bill.issueDate ?? bill.createdAt ?? new Date(),
      dueDate: bill.dueDate ?? new Date(),
      state: bill.status ?? "draft",
      moveType: "in_invoice",
      invoiceLines: (bill.items || []).map((item: any) => ({
        name: item.description,
        quantity: item.quantity,
        priceUnit: item.rate,
        priceSubtotal: item.amount,
      })),
      currencyId: bill.currency ?? "INR",
      amountUntaxed,
      amountTax,
      amountTotal,
      amountResidual: bill.status === "paid" ? 0 : amountTotal,
      paymentState: bill.status === "paid" ? "paid" : "not_paid",
      createdBy: bill.createdBy,
    });

    console.log(`  ${bill.billNumber}: migrated to Invoice (moveType: in_invoice, partnerId: ${vendor._id}).`);
  }

  console.log("Done. The original scripts/*-created \"bills\" collection documents were left in place for manual review — safe to drop once verified.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
