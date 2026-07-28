import Account from "@/models/Account";
import mongoose from "mongoose";

const DEFAULT_ACCOUNTS = [
  // Assets
  { code: "1000", name: "Assets", account_type: "asset_current", internal_group: "asset", parentCode: null },
  { code: "1100", name: "Cash & Cash Equivalents", account_type: "asset_cash", internal_group: "asset", parentCode: "1000" },
  { code: "1110", name: "Main Cash", account_type: "asset_cash", internal_group: "asset", parentCode: "1100" },
  { code: "1120", name: "Bank Current Account", account_type: "asset_cash", internal_group: "asset", parentCode: "1100" },
  { code: "1200", name: "Accounts Receivable", account_type: "asset_receivable", internal_group: "asset", parentCode: "1000", reconcile: true },
  { code: "1210", name: "TDS Receivable", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1300", name: "Stock/Inventory Account", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1400", name: "Fixed Assets", account_type: "asset_fixed", internal_group: "asset", parentCode: "1000" },

  // Liabilities
  { code: "2000", name: "Liabilities", account_type: "liability_current", internal_group: "liability", parentCode: null },
  { code: "2100", name: "Accounts Payable", account_type: "liability_payable", internal_group: "liability", parentCode: "2000", reconcile: true },
  { code: "2150", name: "Customer Advances", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2200", name: "Goods Received Not Invoiced (GRNI)", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },

  // Equity
  { code: "3000", name: "Equity", account_type: "equity", internal_group: "equity", parentCode: null },
  { code: "3100", name: "Owner/Share Capital", account_type: "equity", internal_group: "equity", parentCode: "3000" },
  { code: "3200", name: "Retained Earnings", account_type: "equity_unaffected", internal_group: "equity", parentCode: "3000" },

  // Income
  { code: "4000", name: "Income", account_type: "income", internal_group: "income", parentCode: null },
  { code: "4100", name: "Sales Revenue", account_type: "income", internal_group: "income", parentCode: "4000" },

  // Expense
  { code: "5000", name: "Expense", account_type: "expense", internal_group: "expense", parentCode: null },
  { code: "5100", name: "Cost of Goods Sold (COGS)", account_type: "expense_direct_cost", internal_group: "expense", parentCode: "5000" },
  { code: "5150", name: "Bank Charges", account_type: "expense", internal_group: "expense", parentCode: "5000" },
  { code: "5200", name: "Salary Expense", account_type: "expense", internal_group: "expense", parentCode: "5000" },
  { code: "5300", name: "Depreciation Expense", account_type: "expense_depreciation", internal_group: "expense", parentCode: "5000" },
];

export async function seedChartOfAccounts(tenantId: string, createdByUserId: string) {
  // Check if tenant already has accounts
  const existingCount = await Account.countDocuments({ tenantId });
  if (existingCount > 0) {
    const result = await ensureChartOfAccounts(tenantId, createdByUserId);
    return {
      message:
        result.created > 0
          ? "Added missing default accounts to existing Chart of Accounts"
          : "Chart of Accounts already exists for this tenant",
      count: result.count,
      created: result.created,
    };
  }

  const result = await ensureChartOfAccounts(tenantId, createdByUserId);
  return {
    message: "Successfully seeded Chart of Accounts",
    count: result.count,
    created: result.created,
  };
}

export async function ensureChartOfAccounts(
  tenantId: string,
  createdByUserId: string,
) {
  if (!mongoose.Types.ObjectId.isValid(createdByUserId)) {
    throw new Error("A valid user is required to initialize Chart of Accounts.");
  }

  const createdAccountsMap = new Map<string, any>();
  let created = 0;

  for (const account of DEFAULT_ACCOUNTS) {
    const parentDoc = account.parentCode
      ? createdAccountsMap.get(account.parentCode) ||
        (await Account.findOne({ tenantId, code: account.parentCode }))
      : null;

    let accountDoc = await Account.findOne({ tenantId, code: account.code });

    if (!accountDoc) {
      try {
        accountDoc = await Account.create({
          tenantId,
          code: account.code,
          name: account.name,
          account_type: account.account_type,
          internal_group: account.internal_group,
          reconcile: account.reconcile || false,
          createdBy: new mongoose.Types.ObjectId(createdByUserId),
          parentCode: account.parentCode,
          parentId: parentDoc?._id || null,
          isSystemSeeded: true,
        });
        created += 1;
      } catch (error: any) {
        if (error?.code !== 11000) {
          throw error;
        }
        accountDoc = await Account.findOne({ tenantId, code: account.code });
      }
    }

    createdAccountsMap.set(account.code, accountDoc);
  }

  return {
    count: await Account.countDocuments({ tenantId }),
    created,
  };
}
