import mongoose from "mongoose";
import BankStatement from "@/models/finance/BankStatement";
import JournalEntry from "@/models/finance/JournalEntry";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * The bank reconciliation "position" — extracted out of AI-03's own `extract()` (a safe,
 * behaviour-preserving refactor: AI-03 calls this exact function too, so the two can never
 * silently drift) so AI-22 (Chunk 4, docs/ai/BRIEF-04-BATCH-C.md) can wrap it as its `bank`
 * reconciliation definition instead of reimplementing bank-vs-GL logic a second time.
 *
 * `glBalance`/`difference` are new — AI-03 itself never needed a GL-side number (it matches
 * individual lines against individual JournalEntry lines), but a control-account-level
 * comparison needs one. Purely additive: nothing before this read those two fields.
 */
export interface BankPosition {
  bankStatementId: string;
  bankAccountId: string;
  bankBalance: number;
  glBalance: number;
  difference: number;
  unmatchedCount: number;
  oldestUnmatchedDays: number;
}

function roundCurrency(value: number): number {
  return Number(value.toFixed(2));
}

export async function computeBankPosition(tenantId: string, bankStatementId: string): Promise<BankPosition | null> {
  const statement = await BankStatement.findById(bankStatementId).lean();
  if (!statement) return null;

  const bankAccountId = statement.header.journalId;
  const unreconciled = (statement.lineIds ?? []).filter((l) => !l.isReconciled);
  const oldest = unreconciled.reduce((min, l) => Math.min(min, new Date(l.date).getTime()), Date.now());

  const rows = await JournalEntry.aggregate([
    { $match: { tenantId, status: DOCUMENT_STATUS.POSTED } },
    { $unwind: "$lineIds" },
    { $match: { "lineIds.accountId": new mongoose.Types.ObjectId(bankAccountId) } },
    { $group: { _id: null, debit: { $sum: "$lineIds.debit" }, credit: { $sum: "$lineIds.credit" } } },
  ]);
  const glBalance = rows[0] ? roundCurrency(rows[0].debit - rows[0].credit) : 0;
  const bankBalance = statement.header.balance_end_real ?? 0;

  return {
    bankStatementId,
    bankAccountId: String(bankAccountId),
    bankBalance,
    glBalance,
    difference: roundCurrency(bankBalance - glBalance),
    unmatchedCount: unreconciled.length,
    oldestUnmatchedDays: unreconciled.length > 0 ? Math.floor((Date.now() - oldest) / (24 * 60 * 60 * 1000)) : 0,
  };
}
