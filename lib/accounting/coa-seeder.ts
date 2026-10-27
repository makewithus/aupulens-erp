import { getAccountingSession } from "@/lib/accounting/transaction";
import Account from "@/models/finance/Account";
import mongoose from "mongoose";

export const DEFAULT_ACCOUNTS = [
  // Assets
  { code: "1000", name: "Assets", account_type: "asset_current", internal_group: "asset", parentCode: null },
  { code: "1100", name: "Cash & Cash Equivalents", account_type: "asset_cash", internal_group: "asset", parentCode: "1000" },
  { code: "1110", name: "Main Cash", account_type: "asset_cash", internal_group: "asset", parentCode: "1100" },
  { code: "1120", name: "Bank Current Account", account_type: "asset_cash", internal_group: "asset", parentCode: "1100" },
  { code: "1200", name: "Accounts Receivable", account_type: "asset_receivable", internal_group: "asset", parentCode: "1000", reconcile: true },
  { code: "1210", name: "TDS Receivable", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1211", name: "TDS Receivable - Contractors", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1212", name: "TDS Receivable - Professional Fees", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1213", name: "TDS Receivable - Rent", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1214", name: "TDS Receivable - Interest/Other", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1300", name: "Stock/Inventory Account", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1400", name: "Fixed Assets", account_type: "asset_fixed", internal_group: "asset", parentCode: "1000" },

  { code: "1221", name: "CGST Input Tax Credit", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1222", name: "SGST Input Tax Credit", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },
  { code: "1223", name: "IGST Input Tax Credit", account_type: "asset_current", internal_group: "asset", parentCode: "1000" },

  // Liabilities
  { code: "2000", name: "Liabilities", account_type: "liability_current", internal_group: "liability", parentCode: null },
  { code: "2100", name: "Accounts Payable", account_type: "liability_payable", internal_group: "liability", parentCode: "2000", reconcile: true },
  { code: "2150", name: "Customer Advances", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2160", name: "GST Output Tax Payable", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2170", name: "TCS Payable", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2200", name: "Goods Received Not Invoiced (GRNI)", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },

  { code: "2161", name: "CGST Output Tax Payable", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2162", name: "SGST Output Tax Payable", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2163", name: "IGST Output Tax Payable", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2181", name: "TDS Payable - Salaries", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2182", name: "TDS Payable - Contractors", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2183", name: "TDS Payable - Professional Fees", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2184", name: "TDS Payable - Rent", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },
  { code: "2185", name: "TDS Payable - Interest/Other", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },

  { code: "2186", name: "TDS Payable - Other", account_type: "liability_current", internal_group: "liability", parentCode: "2000" },

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

export async function seedChartOfAccounts(tenantId: string, createdByUserId: string, session?: mongoose.ClientSession) {
  session ??= getAccountingSession();
  // Check if tenant already has accounts
  const existingCount = await Account.countDocuments({ tenantId }, { session });
  if (existingCount > 0) {
    const result = await ensureChartOfAccounts(tenantId, createdByUserId, session);
    return {
      message:
        result.created > 0
          ? "Added missing default accounts to existing Chart of Accounts"
          : "Chart of Accounts already exists for this tenant",
      count: result.count,
      created: result.created,
    };
  }

  const result = await ensureChartOfAccounts(tenantId, createdByUserId, session);
  return {
    message: "Successfully seeded Chart of Accounts",
    count: result.count,
    created: result.created,
  };
}

const ACCOUNT_TYPE_NAME_MAP: Record<string, string> = {
  asset_receivable: "Accounts Receivable",
  asset_cash: "Cash",
  asset_current: "Other Current Asset",
  asset_non_current: "Non Current Asset",
  asset_fixed: "Fixed Asset",
  liability_payable: "Accounts Payable",
  liability_current: "Other Current Liability",
  liability_non_current: "Non Current Liability",
  equity: "Equity",
  equity_unaffected: "Equity",
  income: "Income",
  income_other: "Other Income",
  expense: "Expense",
  expense_depreciation: "Expense",
  expense_direct_cost: "Cost Of Goods Sold",
};

export async function ensureChartOfAccounts(
  tenantId: string,
  createdByUserId: string,
  session?: mongoose.ClientSession,
) {
  session ??= getAccountingSession();
  if (!mongoose.Types.ObjectId.isValid(createdByUserId)) {
    throw new Error("A valid user is required to initialize Chart of Accounts.");
  }

  // Find all accounts for this tenant matching default codes OR default names
  const defaultCodes = DEFAULT_ACCOUNTS.map((a) => a.code);
  const defaultNames = DEFAULT_ACCOUNTS.map((a) => a.name);

  const existingAccounts = await Account.find(
    {
      tenantId,
      $or: [
        { code: { $in: defaultCodes } },
        { accountCode: { $in: defaultCodes } },
        { name: { $in: defaultNames } },
        { accountName: { $in: defaultNames } },
      ],
    },
  ).session(session || null);

  const accountsByCode = new Map<string, any>();
  const accountsByName = new Map<string, any>();

  for (const a of existingAccounts) {
    if (a.code) accountsByCode.set(a.code, a);
    if (a.accountCode) accountsByCode.set(a.accountCode, a);
    if (a.name) accountsByName.set(a.name.toLowerCase().trim(), a);
    if (a.accountName) accountsByName.set(a.accountName.toLowerCase().trim(), a);
  }

  // Load account types for tenant
  const AccountType = (await import("@/models/finance/AccountType")).default;
  const existingTypes = await AccountType.find({ tenantId }).session(session || null).lean();
  const typeMap = new Map<string, mongoose.Types.ObjectId>();
  for (const t of existingTypes) {
    typeMap.set(t.name.toLowerCase().trim(), t._id as mongoose.Types.ObjectId);
    if (t.segment) typeMap.set(t.segment.toLowerCase().trim(), t._id as mongoose.Types.ObjectId);
  }

  let created = 0;

  for (const account of DEFAULT_ACCOUNTS) {
    const existing = accountsByCode.get(account.code) || accountsByName.get(account.name.toLowerCase().trim());
    const typeName = ACCOUNT_TYPE_NAME_MAP[account.account_type] || "Other Current Asset";
    const typeId = typeMap.get(typeName.toLowerCase().trim());

    if (existing) {
      // Ensure missing metadata fields are populated without duplicating
      let dirty = false;
      if (!existing.accountType && typeId) {
        existing.accountType = typeId;
        dirty = true;
      }
      if (!existing.accountName) {
        existing.accountName = existing.name || account.name;
        dirty = true;
      }
      if (!existing.name) {
        existing.name = account.name;
        dirty = true;
      }
      if (!existing.code) {
        existing.code = account.code;
        dirty = true;
      }
      if (!existing.accountCode) {
        existing.accountCode = account.code;
        dirty = true;
      }
      if (existing.isActive === undefined || existing.isActive === null) {
        existing.isActive = true;
        dirty = true;
      }
      if (!existing.status) {
        existing.status = "active";
        dirty = true;
      }
      if (dirty) {
        await existing.save({ session });
      }
    } else {
      const parentDoc = account.parentCode ? accountsByCode.get(account.parentCode) : null;
      try {
        const data = {
          tenantId,
          code: account.code,
          accountCode: account.code,
          name: account.name,
          accountName: account.name,
          accountType: typeId,
          account_type: account.account_type,
          internal_group: account.internal_group,
          reconcile: account.reconcile || false,
          createdBy: new mongoose.Types.ObjectId(createdByUserId),
          parentCode: account.parentCode,
          parentId: parentDoc?._id || null,
          isActive: true,
          status: "active",
          isSystemSeeded: true,
        };
        const accountDoc = session ? (await Account.create([data], { session }))[0] : await Account.create(data);
        accountsByCode.set(account.code, accountDoc);
        accountsByName.set(account.name.toLowerCase().trim(), accountDoc);
        created += 1;
      } catch (error: any) {
        if (session || error?.code !== 11000) {
          throw error;
        }
        const existingDoc = await Account.findOne({ tenantId, code: account.code }).lean();
        if (existingDoc) {
          accountsByCode.set(account.code, existingDoc);
          accountsByName.set(account.name.toLowerCase().trim(), existingDoc);
        }
      }
    }
  }

  return {
    count: await Account.countDocuments({ tenantId }, { session }),
    created,
  };
}
