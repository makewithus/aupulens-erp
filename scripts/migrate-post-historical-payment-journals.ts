/**
 * Backfill for the "Sales Payments don't post to the General Ledger" gap
 * (disclosed in QA_GAP_REPORT.md §7, closed this session via
 * lib/accounting/payments.ts::postCustomerPaymentJournal). Every customer
 * Payment created before this fix landed is "paid" in the Sales module
 * (SalesInvoice.payments[]/status are correct) but has zero GL impact —
 * this script finds those and posts the journal entry they should have
 * gotten at the time, dated to their original payment date.
 *
 * Scope decisions (documented per the task's own request to choose and
 * document how voided historical payments are handled):
 *   - PAID payments with no journalEntryIds yet: backfilled (the normal
 *     case — this is the actual gap).
 *   - DRAFT payments: skipped, not reported as a gap — they never should
 *     have had GL impact and still shouldn't.
 *   - VOID payments with no journalEntryIds: skipped with a note, not
 *     backfilled as an entry+reversal pair. A historical voided payment
 *     never affected the ledger and, being voided, has zero net effect by
 *     definition — posting a matched entry+immediate-reversal pair would
 *     add two dangling, informationless journal entries rather than
 *     correct any real gap. If a specific voided payment's history needs
 *     to be visible for audit purposes, that's a manual/reporting decision,
 *     not something this script should manufacture automatically.
 *   - Payments that already have journalEntryIds (posted under the new
 *     code, or already backfilled by a previous run of this script):
 *     skipped — safe to re-run.
 *
 * Usage:
 *   npx tsx scripts/migrate-post-historical-payment-journals.ts            # report only
 *   npx tsx scripts/migrate-post-historical-payment-journals.ts --apply     # backfill
 */
import "dotenv/config";
import connectDB from "../lib/db";
import Payment from "../models/Payment";
import { SalesInvoice } from "../models/SalesInvoice";
import { postCustomerPaymentJournal } from "../lib/accounting/payments";
import { PAYMENT_STATUS } from "../lib/constants/statuses";

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();

  const unposted = await (Payment as any).find({
    status: PAYMENT_STATUS.PAID,
    $or: [{ journalEntryIds: { $exists: false } }, { journalEntryIds: { $size: 0 } }],
  });

  const voidUnposted = await (Payment as any).countDocuments({
    status: PAYMENT_STATUS.VOID,
    $or: [{ journalEntryIds: { $exists: false } }, { journalEntryIds: { $size: 0 } }],
  });

  console.log(`Found ${unposted.length} paid payment(s) with no GL journal entry yet.`);
  console.log(
    `Found ${voidUnposted} voided payment(s) with no GL journal entry — SKIPPED by design (see script header), not counted as a gap.`,
  );

  let posted = 0;
  let failed = 0;

  for (const payment of unposted) {
    const allocatedTotal = (payment.allocations || []).reduce(
      (acc: number, a: any) => acc + (Number(a.amount) || 0),
      0,
    );
    const snapshot = {
      allocatedTotal,
      unusedAmount: Number(payment.unusedAmount) || 0,
      bankCharges: Number(payment.bankCharges) || 0,
      tdsAmount: Number(payment.tdsAmount) || 0,
    };

    const invoiceIds = (payment.allocations || []).map((a: any) => a.invoiceId);
    const invoices = invoiceIds.length
      ? await (SalesInvoice as any).find({ _id: { $in: invoiceIds } }).select("number").lean()
      : [];

    console.log(
      `[${apply ? "POSTING" : "WOULD POST"}] ${payment.paymentNumber} (${payment._id}), dated ${
        payment.paymentDate.toISOString().slice(0, 10)
      }: allocatedTotal=${snapshot.allocatedTotal} unusedAmount=${snapshot.unusedAmount} bankCharges=${
        snapshot.bankCharges
      } tdsAmount=${snapshot.tdsAmount}`,
    );

    if (!apply) continue;

    try {
      const journalEntryId = await postCustomerPaymentJournal({
        payment,
        tenantId: payment.tenantId,
        createdBy: String(payment.createdBy || ""),
        current: snapshot,
        invoiceNumbers: invoices.map((inv: any) => inv.number),
      });
      if (journalEntryId) {
        await payment.save();
        posted++;
        console.log(`  -> posted journal entry ${journalEntryId}`);
      } else {
        console.log("  -> nothing to post (zero-amount payment)");
      }
    } catch (err: any) {
      failed++;
      console.log(`  -> FAILED: ${err.message}`);
    }
  }

  console.log(
    `\nDone. ${unposted.length} candidate(s) found${
      apply ? `, ${posted} posted, ${failed} failed.` : "."
    }`,
  );
  if (!apply && unposted.length > 0) {
    console.log("Re-run with --apply to post these journal entries.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
