import connectDB from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import Account from "@/models/finance/Account";
import AccountingSettings from "@/models/finance/AccountingSettings";
import { checkSod } from "@/lib/aiRuntime/journalPatterns/sod";
import { traceDecisionForRecord } from "@/lib/aiRuntime/audit/decisionTrace";
import { loadTenantJournalBaseline } from "@/lib/aiRuntime/journalReview/tenantBaseline";
import { scoreJournalRisk, type JournalRiskInput, type JournalRiskResult } from "@/lib/aiRuntime/journalReview/scoreJournalRisk";

/** Assembles `JournalRiskInput` from real data for one `JournalEntry`, then scores it. The one
 *  place AI-23's tool and workflow both call — never two assembly paths. */
export async function buildAndScoreJournalRisk(tenantId: string, entryId: string): Promise<(JournalRiskResult & { entryId: string; entryName: string }) | null> {
  await connectDB();
  const entry = await JournalEntry.findOne({ tenantId, _id: entryId }).lean();
  if (!entry) return null;

  const accountIds = (entry.lineIds ?? []).map((l: { accountId?: unknown }) => l.accountId).filter(Boolean);
  const accounts = await Account.find({ _id: { $in: accountIds } }).select("account_type internal_group name").lean();
  const accountById = new Map(accounts.map((a) => [String(a._id), a]));

  const settings = await AccountingSettings.findOne({ tenantId }).lean();
  const baseline = await loadTenantJournalBaseline(tenantId, new Date(entry.header?.date ?? entry.createdAt));

  const preparerId = entry.createdBy ? String(entry.createdBy) : undefined;
  const approverId = entry.approvalDetails?.approvedBy ? String(entry.approvalDetails.approvedBy) : undefined;
  const sodVerdict = checkSod(preparerId, approverId);

  const traceResult = await traceDecisionForRecord(tenantId, "JournalEntry", entryId, entry.updatedAt);
  const aiOrigin = traceResult.found
    ? {
        workflowId: traceResult.workflowId!,
        workflowVersion: traceResult.workflowVersion!,
        confidence: undefined,
        policyOverrides: undefined,
      }
    : null;

  const input: JournalRiskInput = {
    entryId: String(entry._id),
    entryName: entry.header?.name ?? "",
    journalType: entry.header?.journalType ?? "general",
    entryDate: new Date(entry.header?.date ?? entry.createdAt),
    createdAt: new Date(entry.createdAt),
    createdBy: preparerId ?? null,
    approvedBy: approverId ?? null,
    isReversed: Boolean(entry.isReversed),
    reversedEntryId: entry.reversedEntryId ? String(entry.reversedEntryId) : null,
    amountTotal: Math.abs(entry.totals?.amountTotal ?? 0),
    lines: (entry.lineIds ?? []).map((l: { accountId?: unknown; label?: string; debit?: number; credit?: number }) => {
      const acc = accountById.get(String(l.accountId));
      return {
        accountId: String(l.accountId),
        accountType: acc?.account_type ?? "",
        internalGroup: acc?.internal_group ?? "",
        accountName: acc?.name ?? "",
        label: l.label ?? "",
        amount: Math.abs(l.debit ?? 0) + Math.abs(l.credit ?? 0),
      };
    }),
    approvalThresholdAmount: settings?.journals?.approvalThresholdAmount ?? 0,
    approvalsEnabled: settings?.journals?.approvalsEnabled ?? false,
    sodVerdict,
    aiOrigin,
    baseline,
  };

  const result = scoreJournalRisk(input);
  return { ...result, entryId: input.entryId, entryName: input.entryName };
}
