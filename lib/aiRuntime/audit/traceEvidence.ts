import connectDB from "@/lib/db";
import JournalEntry from "@/models/finance/JournalEntry";
import ExtractedDocument from "@/models/ai/ExtractedDocument";
import AccountingSettings from "@/models/finance/AccountingSettings";
import { drillIntoAccount } from "@/lib/aiRuntime/statements/annotateStatement";
import { runAllReconciliationDefinitions } from "@/lib/aiRuntime/reconciliation/engine";
import { makeClaim, type Claim } from "@/lib/aiRuntime/audit/citations";

/**
 * AI-18's source-to-report trace (docs/ai/BRIEF-07-BATCH-F.md, AI-18 algorithm step 1) — extends
 * AI-21's `drillIntoAccount()` downward to source documents and approvals, never forking a second
 * drill implementation. report line → GL account (caller's own job) → journal entries → source
 * transactions (`drillIntoAccount`) → source documents (`ExtractedDocument.createdRecordId`) →
 * approvals (`JournalEntry.approvalDetails`) → activity history (not yet linkable — see
 * `docs/ai/OPEN_QUESTIONS.md`, `ActivityLog` carries no structured entity reference).
 */

export interface AccountEvidenceTrace {
  figures: Claim[];
  documents: Claim[];
  approvals: Claim[];
  missingEvidence: { subjectRef: { model: string; id: string }; what: string }[];
}

export async function traceAccountEvidence(tenantId: string, accountId: string, accountName: string, period: string): Promise<AccountEvidenceTrace> {
  await connectDB();
  const drill = await drillIntoAccount(tenantId, accountId, period);
  const settings = await AccountingSettings.findOne({ tenantId }).lean();
  const approvalThreshold = settings?.journals?.approvalThresholdAmount ?? 0;
  const approvalsEnabled = settings?.journals?.approvalsEnabled ?? false;

  const figures: Claim[] = [
    makeClaim(`Account ${accountName} moved ${drill.transactions.reduce((s, t) => s + t.signedAmount, 0)} across ${drill.transactions.length} transaction(s) in ${period}`, [
      { model: "Account", id: accountId, label: accountName },
      ...drill.transactions.slice(0, 20).map((t) => ({ model: "JournalEntry", id: t.entryId, label: t.entryName })),
    ]),
  ];

  const documents: Claim[] = [];
  const approvals: Claim[] = [];
  const missingEvidence: AccountEvidenceTrace["missingEvidence"] = [];

  const entryIds = Array.from(new Set(drill.transactions.map((t) => t.entryId)));
  const entries = await JournalEntry.find({ _id: { $in: entryIds } }).select("header approvalRequired approvalDetails totals").lean();
  const entryById = new Map(entries.map((e) => [String(e._id), e]));

  for (const line of drill.transactions) {
    if (line.sourceId) {
      const doc = await ExtractedDocument.findOne({ tenantId, createdRecordId: line.sourceId }).select("_id fileName docType").lean();
      if (doc) {
        documents.push(makeClaim(`${line.entryName} is supported by an uploaded source document (${doc.fileName || doc.docType})`, [{ model: "ExtractedDocument", id: String(doc._id), label: doc.fileName || doc.docType }]));
      } else {
        missingEvidence.push({ subjectRef: { model: "JournalEntry", id: line.entryId }, what: `${line.entryName} references a source document (sourceId) but no ExtractedDocument record for it was found` });
      }
    }

    const entry = entryById.get(line.entryId);
    const amount = Math.abs(entry?.totals?.amountTotal ?? line.signedAmount);
    const needsApproval = approvalsEnabled && amount >= approvalThreshold && approvalThreshold > 0;
    if (entry?.approvalDetails?.approvedBy) {
      approvals.push(makeClaim(`${line.entryName} was approved`, [{ model: "JournalEntry", id: line.entryId, label: line.entryName }]));
    } else if (needsApproval) {
      missingEvidence.push({ subjectRef: { model: "JournalEntry", id: line.entryId }, what: `${line.entryName} is ${amount} (>= approval threshold ${approvalThreshold}) with no approval record` });
    }
  }

  return { figures, documents, approvals, missingEvidence };
}

/** AI-22's own reconciliation results for the accounts this evidence pack covers — reused
 *  verbatim, never a second computation. */
export async function traceReconciliationEvidence(tenantId: string, periodEnd: Date, period: string): Promise<Claim[]> {
  const results = await runAllReconciliationDefinitions(tenantId, periodEnd, period);
  return results
    .filter((r) => r.status !== "not_implemented")
    .map((r) =>
      makeClaim(`${r.name}: ${r.status}${r.status === "unreconciled" ? ` (difference ${r.difference})` : ""}`, [{ model: "ReconciliationResult", id: r.definitionId, label: r.name }]),
    );
}
