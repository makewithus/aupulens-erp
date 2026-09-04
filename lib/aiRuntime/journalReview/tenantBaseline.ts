import connectDB from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * AI-23's tenant-baseline stats (docs/ai/BRIEF-07-BATCH-F.md, AI-23) — "a journal that is
 * unremarkable at one company is bizarre at another, and a global heuristic will be wrong for
 * most tenants." Every baseline here is derived from this tenant's own posted history, never a
 * hard-coded global threshold.
 */

const HISTORY_LOOKBACK_DAYS = 365;

export interface AccountAmountBaseline {
  mean: number;
  stdDev: number;
  sampleSize: number;
}

export interface TenantJournalBaseline {
  accountAmountStats: Map<string, AccountAmountBaseline>;
  posterJournalCounts: Map<string, number>;
  accountCombinationCounts: Map<string, number>;
  totalPostedJournals: number;
}

function accountCombinationKey(accountIds: string[]): string {
  return [...new Set(accountIds)].sort().join("|");
}

export async function loadTenantJournalBaseline(tenantId: string, asOf: Date): Promise<TenantJournalBaseline> {
  await connectDB();
  const since = new Date(asOf.getTime() - HISTORY_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const entries = await JournalEntry.find({ tenantId, status: DOCUMENT_STATUS.POSTED, "header.date": { $gte: since, $lt: asOf } })
    .select("header.date createdBy lineIds")
    .lean();

  const perAccountAmounts = new Map<string, number[]>();
  const posterJournalCounts = new Map<string, number>();
  const accountCombinationCounts = new Map<string, number>();

  for (const entry of entries) {
    const lines = entry.lineIds ?? [];
    const accountIds: string[] = [];
    for (const line of lines) {
      const accId = String((line as { accountId?: unknown }).accountId ?? "");
      if (!accId) continue;
      accountIds.push(accId);
      const amount = Math.abs((line as { debit?: number }).debit ?? 0) + Math.abs((line as { credit?: number }).credit ?? 0);
      const arr = perAccountAmounts.get(accId) ?? [];
      arr.push(amount);
      perAccountAmounts.set(accId, arr);
    }
    if (accountIds.length > 0) {
      const key = accountCombinationKey(accountIds);
      accountCombinationCounts.set(key, (accountCombinationCounts.get(key) ?? 0) + 1);
    }
    const poster = String((entry as { createdBy?: unknown }).createdBy ?? "");
    if (poster) posterJournalCounts.set(poster, (posterJournalCounts.get(poster) ?? 0) + 1);
  }

  const accountAmountStats = new Map<string, AccountAmountBaseline>();
  for (const [accId, amounts] of perAccountAmounts) {
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    const variance = amounts.reduce((s, a) => s + (a - mean) ** 2, 0) / amounts.length;
    accountAmountStats.set(accId, { mean, stdDev: Math.sqrt(variance), sampleSize: amounts.length });
  }

  return { accountAmountStats, posterJournalCounts, accountCombinationCounts, totalPostedJournals: entries.length };
}
