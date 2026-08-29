/**
 * One-off migration: for existing SalesInvoice documents where
 * `markedFullyPaid` is true but real payments don't cover totalAmount (the
 * "Mark as fully paid" checkbox used to be purely cosmetic — see
 * lib/sales/paymentAllocation.ts's settleInvoiceShortfallWithSystemPayment
 * for the code-level fix), auto-record the missing Payment for the
 * shortfall so Accounts Receivable actually gets relieved.
 *
 * Safe to run multiple times: only acts on invoices where paidSum is still
 * short of totalAmount at the time it runs.
 *
 * Usage: npx tsx scripts/migrate-backfill-marked-fully-paid-payments.ts
 */
import "dotenv/config";
import connectDB from "../lib/db";
import { SalesInvoice } from "../models/sales/SalesInvoice";
import User from "../models/auth/User";
import mongoose from "mongoose";
import { settleInvoiceShortfallWithSystemPayment } from "../lib/sales/paymentAllocation";

async function main() {
  await connectDB();

  const invoices = await (SalesInvoice as any).find({ markedFullyPaid: true });
  console.log(`Found ${invoices.length} markedFullyPaid invoice(s) to check.`);

  const tenantAdminCache = new Map<string, string | null>();
  async function fallbackCreatedBy(tenantId: string): Promise<string | null> {
    if (tenantAdminCache.has(tenantId)) return tenantAdminCache.get(tenantId)!;
    const admin = await (User as any).findOne({ tenantId, role: "admin", status: "active" }).select("_id").lean();
    const id = admin ? String(admin._id) : null;
    tenantAdminCache.set(tenantId, id);
    return id;
  }

  let fixed = 0;
  let skipped = 0;
  const failures: { number: string; tenantId: string; error: string }[] = [];

  for (const invoice of invoices) {
    const paidSum = (invoice.payments || []).reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0);
    const shortfall = Math.round((invoice.totalAmount - paidSum) * 100) / 100;
    if (shortfall <= 0.005) {
      skipped += 1;
      continue;
    }

    try {
      let createdBy = mongoose.Types.ObjectId.isValid(String(invoice.createdBy || ""))
        ? String(invoice.createdBy)
        : null;
      if (!createdBy) {
        createdBy = await fallbackCreatedBy(invoice.tenantId);
        if (!createdBy) throw new Error("No active admin user found for tenant to attribute this posting to.");
      }

      await settleInvoiceShortfallWithSystemPayment({
        tenantId: invoice.tenantId,
        customerId: String(invoice.customerId),
        invoice,
        amount: shortfall,
        createdBy,
        paymentDate: invoice.invoiceDate,
      });
      await invoice.save();
      fixed += 1;
      console.log(`  Fixed ${invoice.number} (tenant ${invoice.tenantId}), shortfall=${shortfall}`);
    } catch (error: any) {
      failures.push({ number: invoice.number, tenantId: invoice.tenantId, error: error.message });
      console.error(`  FAILED ${invoice.number} (tenant ${invoice.tenantId}): ${error.message}`);
    }
  }

  console.log(`\nDone. Fixed ${fixed}, skipped ${skipped} (already covered), ${failures.length} failure(s).`);
  process.exit(failures.length ? 1 : 0);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
