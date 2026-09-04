import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import Account from "@/models/finance/Account";
import AiMaterialityPolicy, { findThreshold } from "@/models/ai/AiMaterialityPolicy";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

/**
 * AI-26's consistency sweep (docs/ai/BRIEF-08a-BATCH-G.md, AI-26 algorithm steps 2-4). Every
 * check here reads `Invoice`/`Account`/`AiMaterialityPolicy` only — never writes anywhere.
 */

export interface TreatmentExample {
  ref: string;
  detail: string;
}

export interface TreatmentInconsistency {
  pattern: string;
  treatmentA: { examples: TreatmentExample[] };
  treatmentB: { examples: TreatmentExample[] };
  count: number;
  value: number;
}

/** "A purchase above the (configured) capitalisation threshold that was expensed" — the one real,
 *  buildable consistency check: does an above-threshold bill's line route to Account.account_type
 *  "asset_fixed" (capitalised) or an expense type (expensed)? No stored Invoice→Asset link exists
 *  anywhere in this codebase (confirmed by schema inspection) — the account a bill's own line
 *  posts to is the real, already-recorded signal, not a second guess. */
export async function findCapitalizationInconsistencies(tenantId: string): Promise<TreatmentInconsistency[]> {
  await connectDB();
  const policy = await AiMaterialityPolicy.findOne({ tenantId }).lean();
  const threshold = findThreshold(policy as unknown as import("@/models/ai/AiMaterialityPolicy").IAiMaterialityPolicy | null, "capitalisation");
  if (!threshold?.absoluteAmount) return []; // nothing to check consistency against without a configured threshold

  const bills = await Invoice.find({ tenantId, moveType: "in_invoice", state: { $ne: DOCUMENT_STATUS.CANCELLED }, amountTotal: { $gte: threshold.absoluteAmount } })
    .select("name amountTotal invoiceLines")
    .lean();
  if (bills.length === 0) return [];

  const accountIds = Array.from(
    new Set(bills.flatMap((b) => ((b.invoiceLines ?? []) as { accountId?: unknown }[]).map((l) => l.accountId).filter(Boolean).map(String))),
  );
  const accounts = await Account.find({ tenantId, _id: { $in: accountIds } }).select("account_type").lean();
  const typeById = new Map(accounts.map((a) => [String(a._id), a.account_type]));

  const capitalized: TreatmentExample[] = [];
  const expensed: TreatmentExample[] = [];
  let expensedValue = 0;

  for (const b of bills) {
    const lineTypes = ((b.invoiceLines ?? []) as { accountId?: unknown }[]).map((l) => (l.accountId ? typeById.get(String(l.accountId)) : undefined));
    const isCapitalized = lineTypes.includes("asset_fixed");
    const isExpensed = lineTypes.some((t) => t === "expense" || t === "expense_direct_cost" || t === "expense_depreciation");
    if (isCapitalized) capitalized.push({ ref: String(b._id), detail: `${b.name} (₹${b.amountTotal}) posted to an asset_fixed account` });
    else if (isExpensed) {
      expensed.push({ ref: String(b._id), detail: `${b.name} (₹${b.amountTotal}) posted to an expense account despite being above the ₹${threshold.absoluteAmount} capitalisation threshold` });
      expensedValue += b.amountTotal ?? 0;
    }
  }

  if (capitalized.length === 0 || expensed.length === 0) return []; // no inconsistency without both sides represented

  return [
    {
      pattern: "purchase above the configured capitalisation threshold — capitalised vs expensed",
      treatmentA: { examples: capitalized },
      treatmentB: { examples: expensed },
      count: capitalized.length + expensed.length,
      value: Math.round(expensedValue * 100) / 100,
    },
  ];
}

export interface PolicyGap {
  gap: string;
  evidence: string;
  impactEstimate: string;
  inheritedFrom: string;
}

/** A transaction type (a real, registered workflow actionClass) with no materiality/policy
 *  threshold configured — a live, generalised instance of the same "no policy object" gap A.3
 *  names specifically for capitalisation, computed across every action class that actually reads
 *  AiMaterialityPolicy today, not invented. */
export async function findUncoveredTransactionTypes(tenantId: string): Promise<PolicyGap[]> {
  await connectDB();
  const policy = await AiMaterialityPolicy.findOne({ tenantId }).lean();
  const typed = policy as unknown as import("@/models/ai/AiMaterialityPolicy").IAiMaterialityPolicy | null;

  // The action classes real workflows (AI-07/08/09/10/11/12/17) actually key their
  // AiMaterialityPolicy.thresholds lookups against — not every actionClass in the system, only
  // the ones a materiality/policy threshold is meaningful for.
  const POLICY_RELEVANT_ACTION_CLASSES = ["accrual", "capitalisation", "prepaid_schedule", "revenue_recognition", "inventory_intelligence", "tax_intelligence"];

  const gaps: PolicyGap[] = [];
  for (const actionClass of POLICY_RELEVANT_ACTION_CLASSES) {
    const threshold = findThreshold(typed, actionClass);
    if (threshold) continue;
    gaps.push({
      gap: `no materiality/policy threshold configured for "${actionClass}" transactions`,
      evidence: `AiMaterialityPolicy.thresholds has no entry with appliesTo="${actionClass}" for this tenant`,
      impactEstimate: "the workflow(s) that key off this action class fall back to a hardcoded default and/or stay RECOMMEND-only until a human configures it",
      inheritedFrom: "AI-26 (this workflow) — a live, per-tenant instance of A.3's capitalisation-threshold gap, generalised across every policy-relevant action class",
    });
  }
  return gaps;
}
