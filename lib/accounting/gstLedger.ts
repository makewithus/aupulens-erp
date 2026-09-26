import Account from "@/models/finance/Account";
import JournalEntry from "@/models/finance/JournalEntry";
import Counter from "@/models/shared/Counter";
import { DOCUMENT_STATUS, VOUCHER_TYPE } from "@/lib/constants/statuses";
import { calculateGstSetoff, GST_INPUT_CODES, GST_OUTPUT_CODES, gstRound, type GstBalances } from "./gst";
import { createPostedJournalEntry } from "./posting";
import { assertTransactionNotLocked } from "./transactionLock";

const GST_SETOFF_LOCK_STALE_MS = 5 * 60 * 1000;

export async function getGstLedger(tenantId: string, asOf: Date) {
  const codes = [...Object.values(GST_INPUT_CODES), ...Object.values(GST_OUTPUT_CODES), "2160"];
  const accounts = await Account.find({ tenantId, code: { $in: codes } }).lean();
  const balances = await JournalEntry.aggregate([
    { $match: { tenantId, status: DOCUMENT_STATUS.POSTED, "header.date": { $lte: asOf } } },
    { $unwind: "$lineIds" },
    { $match: { "lineIds.accountId": { $in: accounts.map((a) => a._id) } } },
    { $group: { _id: "$lineIds.accountId", net: { $sum: { $subtract: ["$lineIds.debit", "$lineIds.credit"] } } } },
  ]);
  const byCode = Object.fromEntries(accounts.map((a) => [a.code, gstRound(balances.find((b) => String(b._id) === String(a._id))?.net || 0)]));
  const input: GstBalances = { cgst: 0, sgst: 0, igst: 0 }, output = { ...input };
  for (const head of ["cgst", "sgst", "igst"] as const) {
    input[head] = Math.max(0, byCode[GST_INPUT_CODES[head]] || 0);
    output[head] = Math.max(0, -(byCode[GST_OUTPUT_CODES[head]] || 0));
  }
  const unclassifiedOutput = gstRound(-(byCode["2160"] || 0));
  return { input, output, unclassifiedOutput, ...calculateGstSetoff(input, output) };
}

export async function postGstSetoff(tenantId: string, userId: string, period: string, expected: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) throw new Error("Choose a valid GST month.");
  const date = new Date(`${period}-01T00:00:00.000Z`);
  date.setUTCMonth(date.getUTCMonth() + 1); date.setUTCMilliseconds(-1);
  if (date > new Date()) throw new Error("GST setoff can only be posted for a completed month.");
  await assertTransactionNotLocked(tenantId, "purchases", date);
  await assertTransactionNotLocked(tenantId, "sales", date);
  // A tenant-wide lock prevents different periods from consuming the same credit concurrently.
  await Counter.updateOne({ tenantId, key: "gst-setoff-lock" }, { $setOnInsert: { seq: 0 } }, { upsert: true });
  const staleBefore = new Date(Date.now() - GST_SETOFF_LOCK_STALE_MS);
  const lock = await Counter.findOneAndUpdate(
    { tenantId, key: "gst-setoff-lock", $or: [{ seq: 0 }, { updatedAt: { $lt: staleBefore } }] },
    { $set: { seq: 1 } },
  );
  if (!lock) throw new Error("A GST setoff is in progress. Refresh before retrying.");
  try {
    const name = `GST/SETOFF/${period}`;
    if (await JournalEntry.exists({ tenantId, "header.name": name })) throw new Error("A setoff has already been posted for this month.");
    const newer = await JournalEntry.exists({ tenantId, "header.name": /^GST\/SETOFF\//, "header.date": { $gt: date } });
    if (newer) throw new Error("A later GST setoff is already posted. Use an adjustment journal for earlier periods.");
    const summary = await getGstLedger(tenantId, date);
    if (JSON.stringify(summary) !== expected) throw new Error("GST balances changed. Refresh and review the new amounts.");
    if (Math.abs(summary.unclassifiedOutput) > 0.005) throw new Error("Reclassify legacy GST output to CGST, SGST or IGST before applying credit.");
    if (!summary.totalCreditUsed) throw new Error("No eligible credit can be applied to these liabilities.");
    const accounts = await Account.find({ tenantId, code: { $in: [...Object.values(GST_INPUT_CODES), ...Object.values(GST_OUTPUT_CODES)] } }).lean();
    const accountId = (code: string) => {
      const a = accounts.find((a) => a.code === code);
      if (!a) throw new Error(`Missing GST account ${code}.`);
      return a._id;
    };
    const lineIds = summary.allocations.flatMap((a) => [
      { accountId: accountId(GST_OUTPUT_CODES[a.to]), debit: a.amount, credit: 0, label: `${a.to.toUpperCase()} liability offset` },
      { accountId: accountId(GST_INPUT_CODES[a.from]), debit: 0, credit: a.amount, label: `${a.from.toUpperCase()} input credit utilised` },
    ]);
    return await createPostedJournalEntry({ tenantId, header: { name, ref: `GST setoff ${period}`, date, journalType: "general" }, voucherType: VOUCHER_TYPE.JOURNAL, lineIds, createdBy: userId });
  } finally {
    await Counter.updateOne({ tenantId, key: "gst-setoff-lock" }, { $set: { seq: 0 } });
  }
}
