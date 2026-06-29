import Account from "@/models/Account";

export async function applySemanticRulesAndClassify(body: any, tenantId: string) {
  if (!body.lineIds || body.lineIds.length === 0) return { ok: true, body };

  const accountIds = body.lineIds.map((l: any) => l.accountId).filter(Boolean);
  const accounts = await Account.find({ _id: { $in: accountIds }, tenantId }).lean();
  const accMap = new Map(accounts.map((a: any) => [String(a._id), a.account_type]));

  let hasExpense = false;
  let hasIncome = false;
  let hasAsset = false;
  let hasCashOrBank = false;
  let hasLiability = false;

  for (const line of body.lineIds) {
    const type = accMap.get(String(line.accountId));
    if (!type) continue;
    if (type.includes("expense")) hasExpense = true;
    if (type.includes("income")) hasIncome = true;
    if (type.includes("asset")) hasAsset = true;
    if (type === "asset_cash" || type === "asset_bank") hasCashOrBank = true;
    if (type.includes("liability")) hasLiability = true;
  }

  // Smart Validation Rules
  if (hasExpense && !hasCashOrBank && !hasLiability) {
    return { ok: false, error: "Semantic Error: An expense must be offset by Cash, Bank, or a Liability account." };
  }
  if (hasIncome && !hasCashOrBank && !hasAsset) {
    return { ok: false, error: "Semantic Error: Income must be offset by Cash, Bank, or an Asset account." };
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
