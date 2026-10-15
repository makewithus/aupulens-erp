import type { ReportAccount } from "@/lib/accounting/reports";

export type BalanceSheetReviewItem = {
  severity: "warning" | "info";
  code: string;
  message: string;
};

type AccountSection = { accounts?: Record<string, ReportAccount> };

const CONTRA_ASSET_NAME = /(?:accumulated\s+(?:depreciation|amortization)|allowance\s+for\s+(?:doubtful|bad)\s+debts?|provision\s+for\s+(?:doubtful|bad)\s+debts?)/i;
const CASH_OR_BANK_NAME = /\b(?:cash|bank)\b/i;
const TAX_NAME = /\b(?:gst|vat|sales tax)\b/i;
const RETAINED_EARNINGS_NAME = /retained\s+earnings?/i;

function expectedNormalBalance(account: ReportAccount): "debit" | "credit" | null {
  if (account.normalBalance) return account.normalBalance;
  if (account.internalGroup === "asset") {
    return CONTRA_ASSET_NAME.test(account.name) ? "credit" : "debit";
  }
  if (["liability", "equity", "income"].includes(account.internalGroup)) return "credit";
  if (account.internalGroup === "expense") return "debit";
  return null;
}

function isContraAssetAccount(account: ReportAccount) {
  return account.internalGroup === "asset" &&
    (account.isContraAccount === true || CONTRA_ASSET_NAME.test(account.name));
}

function isUnexpectedSide(account: ReportAccount, normalBalance: "debit" | "credit") {
  // Report amounts are signed according to the account's group: asset/expense
  // debit balances are positive; liability/equity credit balances are positive.
  const debitBalance = ["asset", "expense"].includes(account.internalGroup)
    ? account.amount > 0.01
    : account.amount < -0.01;
  const creditBalance = ["asset", "expense"].includes(account.internalGroup)
    ? account.amount < -0.01
    : account.amount > 0.01;
  return normalBalance === "debit" ? creditBalance : debitBalance;
}

/**
 * Review notices are based on each account's group and normal balance. They
 * describe exceptions without mutating/reclassifying posted accounting data.
 */
export function getBalanceSheetReviewItems({
  asset,
  liability,
  equity,
}: {
  asset: AccountSection;
  liability: AccountSection;
  equity: AccountSection;
}): BalanceSheetReviewItem[] {
  const items: BalanceSheetReviewItem[] = [];
  const accounts = [
    ...Object.values(asset.accounts || {}),
    ...Object.values(liability.accounts || {}),
    ...Object.values(equity.accounts || {}),
  ];

  for (const account of accounts) {
    if (!Number.isFinite(account.amount) || Math.abs(account.amount) <= 0.01) continue;
    const normal = expectedNormalBalance(account);
    if (!normal) continue;
    const contraAsset = isContraAssetAccount(account);
    const debitSigned = ["asset", "expense"].includes(account.internalGroup)
      ? account.amount
      : -account.amount;
    const isDebitBalance = debitSigned > 0.01;
    const name = `${account.name} (${account.code})`;

    if (contraAsset && !isUnexpectedSide(account, normal)) {
      items.push({
        severity: "info",
        code: account.code,
        message: `${name} is a contra-asset account with its expected credit balance.`,
      });
      continue;
    }

    if (!isUnexpectedSide(account, normal)) continue;

    if (contraAsset) {
      items.push({
        severity: "warning",
        code: account.code,
        message: `${name} has an unexpected debit balance for a contra-asset. Review depreciation, disposals, and adjustment postings.`,
      });
    } else if (account.internalGroup === "asset" && normal === "debit" && !isDebitBalance) {
      const cashOrBank = account.accountType === "asset_cash" || CASH_OR_BANK_NAME.test(account.name);
      items.push({
        severity: "warning",
        code: account.code,
        message: cashOrBank
          ? `${name} has an unusual credit balance while classified as an asset. Inspect the ledger and bank reconciliation; verify whether this is an overdraft or a data/classification issue.`
          : `${name} has an unusual credit balance while classified as an asset. Review its ledger and account classification.`,
      });
    } else if (account.internalGroup === "liability" && isDebitBalance) {
      items.push({
        severity: "warning",
        code: account.code,
        message: TAX_NAME.test(account.name)
          ? `${name} has a debit balance while classified as a liability. It may represent recoverable/input tax credit, an account-mapping issue, or incorrect postings; verify against tax records.`
          : `${name} has a debit balance while classified as a liability. Review the ledger and account classification.`,
      });
    } else if (account.internalGroup === "equity" && RETAINED_EARNINGS_NAME.test(account.name) && isDebitBalance) {
      items.push({
        severity: "info",
        code: account.code,
        message: `${name} has a debit balance that may represent accumulated losses. Verify cumulative posted profit and loss and any closing journals through the selected date.`,
      });
    } else {
      items.push({
        severity: "warning",
        code: account.code,
        message: `${name} has an unexpected ${isDebitBalance ? "debit" : "credit"} balance for its ${account.internalGroup} classification. Review the ledger and account classification.`,
      });
    }
  }

  return items;
}
