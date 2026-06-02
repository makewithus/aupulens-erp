import Account from "@/models/Account";
import mongoose from "mongoose";

const DEFAULT_ACCOUNTS = [
  // Assets
  { code: "1000", name: "Assets", account_type: "asset_current", internal_group: "asset", parentCode: null },
  { code: "1100", name: "Cash & Cash Equivalents", account_type: "asset_cash", internal_group: "asset", parentCode: "1000" },
  { code: "1110", name: "Main Cash", account_type: "asset_cash", internal_group: "asset", parentCode: "1100" },
  { code: "1120", name: "Bank Current Account", account_type: "asset_cash", internal_group: "asset", parentCode: "1100" },
  { code: "1200", name: "Accounts Receivable", account_type: "asset_receivable", internal_group: "asset", parentCode: "1000", reconcile: true },
  { code: "1300", name: "Stock/Inventory Account", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1400", name: "Fixed Assets", account_type: "asset_fixed", internal_group: "asset", parentCode: "1000" },

  // Liabilities
  { code: "2000", name: "Liabilities", account_type: "liability_current", internal_group: "liability", parentCode: null },
  { code: "2100", name: "Accounts Payable", account_type: "liability_payable", internal_group: "liability", parentCode: "2000", reconcile: true },
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
  { code: "5200", name: "Salary Expense", account_type: "expense", internal_group: "expense", parentCode: "5000" },
  { code: "5300", name: "Depreciation Expense", account_type: "expense_depreciation", internal_group: "expense", parentCode: "5000" },
];

export async function seedChartOfAccounts(tenantId: string, createdByUserId: string) {
  // Check if tenant already has accounts
  const existingCount = await Account.countDocuments({ tenantId });
  if (existingCount > 0) {
    return { message: "Chart of Accounts already exists for this tenant", count: existingCount };
  }

  const createdAccountsMap = new Map<string, any>();

  // 1. Create root accounts (those without parentCode)
  const roots = DEFAULT_ACCOUNTS.filter(acc => !acc.parentCode);
  for (const root of roots) {
    const accDoc = await Account.create({
      tenantId,
      code: root.code,
      name: root.name,
      account_type: root.account_type,
      internal_group: root.internal_group,
      reconcile: root.reconcile || false,
      createdBy: new mongoose.Types.ObjectId(createdByUserId),
      parentCode: null,
      parentId: null,
    });
    createdAccountsMap.set(root.code, accDoc);
  }

  // 2. Create child accounts level by level or with simple loop since we know parents are created first
  const children = DEFAULT_ACCOUNTS.filter(acc => !!acc.parentCode);
  for (const child of children) {
    const parentDoc = createdAccountsMap.get(child.parentCode!);
    if (!parentDoc) {
      console.warn(`Parent account with code ${child.parentCode} not found for child ${child.code}`);
    }

    const accDoc = await Account.create({
      tenantId,
      code: child.code,
      name: child.name,
      account_type: child.account_type,
      internal_group: child.internal_group,
      reconcile: child.reconcile || false,
      createdBy: new mongoose.Types.ObjectId(createdByUserId),
      parentCode: child.parentCode,
      parentId: parentDoc ? parentDoc._id : null,
    });
    createdAccountsMap.set(child.code, accDoc);
  }

  return { message: "Successfully seeded Chart of Accounts", count: DEFAULT_ACCOUNTS.length };
}
