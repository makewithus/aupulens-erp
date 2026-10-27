import AccountingSettings from "@/models/finance/AccountingSettings";
import Account from "@/models/finance/Account";
import { validateJournalLinesForPosting } from "./journal-validation";

export async function journalPolicy(tenantId: string, entry: any, role: string, nextStatus?: string): Promise<string | null> {
  const settings = await AccountingSettings.findOne({ tenantId }).lean();
  const policy = settings?.journals;
  const lines = entry.lineIds || [];
  const amount = lines.reduce((sum: number, line: any) => sum + Math.max(0, Number(line.debit) || 0), 0);
  const required = entry.approvalRequired || Boolean(policy?.approvalsEnabled && amount >= (policy.approvalThresholdAmount || 0));
  if (required && nextStatus === "approved") {
    if (entry.voucherStatus !== "pending_approval") return "Entry must be submitted for approval first";
    if (![policy?.approverRole || "finance", "admin", "master-admin"].includes(role)) return "Configured approver role required";
  }
  if (required && nextStatus === "posted" && !entry.approvalDetails?.approvedBy) return "A recorded authorized approval is required before posting";
  if (["validated", "approved", "posted"].includes(nextStatus || "")) {
    const validation = validateJournalLinesForPosting(lines);
    if (validation) return validation;
    const ids = [...new Set(lines.map((line: any) => String(line.accountId?._id || line.accountId)))];
    const accounts = await Account.find({ tenantId, _id: { $in: ids } }).select("_id").lean();
    if (accounts.length !== ids.length) return "Journal accounts must exist in the current tenant";
  }
  return null;
}
