/**
 * Report-only script (QA_GAP_REPORT.md item #19): the shared
 * validateJournalLinesForPosting() in lib/accounting/journal-validation.ts
 * did not check for negative debit/credit values on individual lines —
 * only the two Finance journal-entries API routes had that check, inline
 * and duplicated. Every other posting path (lib/accounting/inventory.ts,
 * lib/accounting/payments.ts, the HR payroll-to-GL route) went through
 * createPostedJournalEntry() without it, so a posted entry with a negative
 * line (e.g. JRN/2026/0002, found live during the original audit) could
 * slip through. The check has now been added to the shared validator, so
 * this can't happen going forward — but existing posted entries that
 * already have a negative line predate the fix and need a human to look
 * at them; this script only lists them, it never modifies a posted
 * financial record.
 *
 * Usage: npx tsx scripts/report-negative-journal-lines.ts
 */
import "dotenv/config";
import mongoose from "mongoose";
import connectDB from "../lib/db";
import JournalEntry from "../models/finance/JournalEntry";
import { DOCUMENT_STATUS } from "../lib/constants/statuses";

async function main() {
  await connectDB();

  const posted = await JournalEntry.find({ status: DOCUMENT_STATUS.POSTED }).lean();
  const flagged = posted.filter((entry: any) =>
    (entry.lineIds || []).some((line: any) => (line.debit || 0) < 0 || (line.credit || 0) < 0),
  );

  if (flagged.length === 0) {
    console.log("No posted journal entries with a negative debit/credit line found.");
  } else {
    console.log(`Found ${flagged.length} posted journal entry(ies) with a negative line — review manually, none were modified:`);
    for (const entry of flagged) {
      console.log(`\n  ${entry.header?.name} (tenant: ${entry.tenantId}, _id: ${entry._id})`);
      for (const line of entry.lineIds || []) {
        if ((line.debit || 0) < 0 || (line.credit || 0) < 0) {
          console.log(`    line "${line.label}" — debit: ${line.debit}, credit: ${line.credit}, account: ${line.accountId}`);
        }
      }
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Report failed:", err);
  process.exit(1);
});
