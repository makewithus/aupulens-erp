import Account from "@/models/Account";
import AccountType from "@/models/AccountType";

/** One of the five buckets this validator reasons about. */
type Category = "expense" | "income" | "asset" | "liability" | "cashOrBank" | "equity" | null;

/**
 * Categorizes an account under either schema this codebase uses:
 *  - Legacy: `account_type` string (e.g. "asset_cash", "expense", "liability_payable").
 *  - New Chart-of-Accounts feature: `accountType` ref to AccountType, whose
 *    `segment` (e.g. "Cash and cash equivalents", "Other Current Liability")
 *    is the equivalent categorization signal — real bank accounts added via
 *    the Banking page use this schema exclusively and have no `account_type`
 *    at all, so relying on `account_type` alone silently treats every real
 *    bank/cash account as "unrecognized" and wrongly blocks perfectly
 *    standard entries (e.g. Salary Expense paid from a real bank account).
 */
function categorize(accountType: string | undefined, segment: string | undefined): Category {
  if (accountType) {
    if (accountType === "asset_cash" || accountType === "asset_bank") return "cashOrBank";
    if (accountType.startsWith("equity")) return "equity";
    if (accountType.includes("expense")) return "expense";
    if (accountType.includes("income")) return "income";
    if (accountType.includes("liability")) return "liability";
    if (accountType.includes("asset")) return "asset";
    return null;
  }
  if (segment) {
    if (segment === "Cash and cash equivalents") return "cashOrBank";
    if (segment === "Equity") return "equity";
    if (segment === "Expense" || segment === "Other Expense" || segment === "Cost Of Goods Sold") return "expense";
    if (segment === "Income" || segment === "Other Income") return "income";
    if (segment.includes("Liability")) return "liability";
    if (segment.includes("Asset")) return "asset";
    return null;
  }
  return null;
}

/**
 * Semantic (business-logic) validation and auto-classification for journal
 * entries — on top of the purely mathematical Dr=Cr check in
 * journal-validation.ts. Blocks nonsensical ledger-category pairings (e.g.
 * Expense debited straight against Equity, with no Cash/Bank/Liability
 * offset) that a math-only check can't catch.
 *
 * `body.allowNonStandard: true` is the explicit override path for
 * legitimate non-standard entries (contra/adjustment entries accountants
 * sometimes need) — a semantic failure becomes a non-blocking warning
 * instead of a hard 400, and the caller should persist that the override
 * was used (JournalEntry.semanticOverride) rather than silently allowing it
 * with no trace.
 */
export async function applySemanticRulesAndClassify(body: any, tenantId: string) {
  if (!body.lineIds || body.lineIds.length === 0) return { ok: true, body };

  const accountIds = body.lineIds.map((l: any) => l.accountId).filter(Boolean);
  const accounts = await Account.find({ _id: { $in: accountIds }, tenantId }).lean();

  const accountTypeIds = accounts.map((a: any) => a.accountType).filter(Boolean);
  const accountTypes = accountTypeIds.length
    ? await AccountType.find({ _id: { $in: accountTypeIds } }).lean()
    : [];
  const segmentById = new Map(accountTypes.map((t: any) => [String(t._id), t.segment]));

  const accMap = new Map(
    accounts.map((a: any) => [
      String(a._id),
      categorize(a.account_type, a.accountType ? segmentById.get(String(a.accountType)) : undefined),
    ]),
  );

  let hasExpense = false;
  let hasIncome = false;
  let hasAsset = false;
  let hasCashOrBank = false;
  let hasLiability = false;

  for (const line of body.lineIds) {
    const category = accMap.get(String(line.accountId));
    if (category === "expense") hasExpense = true;
    if (category === "income") hasIncome = true;
    if (category === "asset") hasAsset = true;
    if (category === "cashOrBank") hasCashOrBank = true;
    if (category === "liability") hasLiability = true;
  }

  // Smart Validation Rules
  let semanticError: string | null = null;
  if (hasExpense && !hasCashOrBank && !hasLiability) {
    semanticError = "Semantic Error: An expense must be offset by Cash, Bank, or a Liability account.";
  } else if (hasIncome && !hasCashOrBank && !hasAsset) {
    semanticError = "Semantic Error: Income must be offset by Cash, Bank, or an Asset account.";
  }

  if (semanticError) {
    if (!body.allowNonStandard) {
      return { ok: false, error: semanticError };
    }
    // Override path: don't block, but leave an audit trail instead of
    // silently letting a non-standard pairing through with no trace.
    body.semanticOverride = {
      applied: true,
      warning: semanticError,
      reason: typeof body.overrideReason === "string" ? body.overrideReason : undefined,
    };
  }

  // Auto-Classification
  let journalType = "general";
  let voucherType = "journal";

  if (hasExpense && hasCashOrBank) {
    journalType = "cash";
    voucherType = "payment";
  } else if (hasIncome && hasCashOrBank) {
    journalType = "cash";
    voucherType = "receipt";
  } else if (hasCashOrBank && !hasExpense && !hasIncome) {
    journalType = "bank";
    voucherType = "contra";
  } else if (hasIncome && hasAsset && !hasCashOrBank) {
    journalType = "sale";
    voucherType = "sales";
  } else if (hasExpense && hasLiability && !hasCashOrBank) {
    journalType = "purchase";
    voucherType = "purchase";
  }

  body.header = body.header || {};
  body.header.journalType = journalType;
  body.voucherType = voucherType;

  return { ok: true, body };
}
