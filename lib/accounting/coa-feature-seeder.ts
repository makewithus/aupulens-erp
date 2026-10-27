import { getAccountingSession } from "@/lib/accounting/transaction";
import mongoose from "mongoose";
import AccountType from "@/models/finance/AccountType";
import Account from "@/models/finance/Account";
import Accountant from "@/models/finance/Accountant";

const ACCOUNT_TYPES_DATA = [
  { name: "Accounts Payable", segment: "Other Current Liability", description: "Accounts Payable are amounts due to vendors for goods or services received." },
  { name: "Accounts Receivable", segment: "Other Current Asset", description: "Accounts Receivable represents the amount a business is yet to receive from its customers for goods or services sold." },
  { name: "Accruals and Deferred Income", segment: "Other Current Liability", description: "Accruals and Deferred Income" },
  { name: "Bank", segment: "Cash and cash equivalents", description: "Bank includes the funds a business holds in its bank accounts, including checking, savings, current, or other deposit accounts." },
  { name: "Called-up Share Capital Not Paid", segment: "Other Current Asset", description: "Called-up Share Capital Not Paid" },
  { name: "Cash", segment: "Cash and cash equivalents", description: "Cash is physical currency and cash equivalents held and readily available for business use." },
  { name: "Cost Of Goods Sold", segment: "Cost Of Goods Sold", description: "Cost of Goods Sold is direct costs tied to the production of goods and services." },
  { name: "Credit Card", segment: "Other Current Liability", description: "Credit Card is outstanding balances the business owes on credit card accounts." },
  { name: "Deferred Tax Asset", segment: "Non Current Asset", description: "Deferred Tax Asset represents future tax benefits a business can claim due to temporary differences between accounting and tax treatments or from carried-forward losses." },
  { name: "Deferred Tax Liability", segment: "Non Current Liability", description: "Deferred Tax Liability represents taxes owed in the future due to temporary timing differences in financial reporting." },
  { name: "Equity", segment: "Equity", description: "Equity is the owner's residual interest in the business after liabilities are deducted." },
  { name: "Expense", segment: "Expense", description: "Expense is operational costs incurred while running the business." },
  { name: "Fixed Asset", segment: "Fixed Asset", description: "Fixed Asset is a long-term physical asset like buildings, machinery, land, or equipment used in business operations." },
  { name: "Income", segment: "Income", description: "Income is revenue generated from the business's primary operations." },
  { name: "Intangible Asset", segment: "Fixed Asset", description: "Intangible Asset is a non-physical asset like patents, trademarks, copyrights, or goodwill that adds value to a business." },
  { name: "Non Current Asset", segment: "Non Current Asset", description: "Long Term Asset is an asset that provides value over an extended period and is not expected to be converted into cash within a year." },
  { name: "Non Current Liability", segment: "Non Current Liability", description: "Long Term Liability is a financial obligation due after one year, like long-term loans." },
  { name: "Other Asset", segment: "Other Asset", description: "Other Assets refers to the assets that don't fall under standard asset categories but still hold value for the business." },
  { name: "Other Current Asset", segment: "Other Current Asset", description: "Other Current Assets are short-term assets expected to be used or converted into cash within a year." },
  { name: "Other Current Liability", segment: "Other Current Liability", description: "Other Current Liability includes short-term obligations expected to be paid within a year." },
  { name: "Other Expense", segment: "Other Expense", description: "Other Expense includes miscellaneous expenses that don't fall into standard categories." },
  { name: "Other Income", segment: "Other Income", description: "Other Income is earnings from secondary or non-operating business activities." },
  { name: "Other Liability", segment: "Other Liability", description: "Other Liability includes financial obligations that don't fall under standard categories like loans, credit cards, or payables." },
  { name: "Overseas Tax Payable", segment: "Other Current Liability", description: "Overseas Tax Payable represents tax liabilities the business owes to foreign tax authorities, incurred through international operations." },
  { name: "Payment Clearing Account", segment: "Other Current Asset", description: "Payment Clearing is a temporary account used to track and process payments until they are settled." },
  { name: "Staff Cost", segment: "Expense", description: "Staff Cost" },
  { name: "Stock", segment: "Other Current Asset", description: "Stock is inventory or shares held by a business for sale, production, or investment purposes." },
];

const ACCOUNTS_DATA = [
  { name: "Other Charges", type: "Income", locked: true },
  { name: "Construction Loans", type: "Non Current Liability", locked: false },
  { name: "Mortgages", type: "Non Current Liability", locked: false },
  { name: "TDS Payable", type: "Other Current Liability", locked: false },
  { name: "TDS Receivable", type: "Other Current Asset", locked: false },
  { name: "Prepaid Expenses", type: "Other Current Asset", locked: false },
  { name: "Purchase Discounts", type: "Expense", locked: true },
  { name: "Inventory Asset", type: "Stock", locked: true },
  { name: "Shipping Charge", type: "Income", locked: true },
  { name: "Investments", type: "Equity", locked: false },
  { name: "Unearned Revenue", type: "Other Current Liability", locked: true },
  { name: "Opening Balance Adjustments", type: "Other Current Liability", locked: true },
  { name: "Dimension Adjustments", type: "Other Liability", locked: true },
  { name: "Uncategorized", type: "Expense", locked: true },
  { name: "Employee Reimbursements", type: "Other Current Liability", locked: true },
  { name: "Undeposited Funds", type: "Cash", locked: true },
  { name: "Cost of Goods Sold", type: "Cost Of Goods Sold", locked: true },
  { name: "Lodging", type: "Expense", locked: true },
  { name: "Merchandise", type: "Expense", locked: false },
  { name: "Finished Goods", type: "Stock", locked: true },
  { name: "Work In Progress", type: "Stock", locked: true },
  { name: "Accrued Purchases", type: "Other Current Liability", locked: false },
  { name: "Sales to Customers (Cash)", type: "Other Current Asset", locked: true },
  { name: "Fuel/Mileage Expenses", type: "Expense", locked: false },
  { name: "Contract Assets", type: "Expense", locked: false },
  { name: "Depreciation And Amortisation", type: "Expense", locked: false },
  { name: "Transportation Expense", type: "Expense", locked: false },
  { name: "Employee Advance", type: "Other Current Asset", locked: true },
  { name: "Raw Materials And Consumables", type: "Expense", locked: false },
  { name: "Dividends Paid", type: "Equity", locked: false },
  { name: "Capital Stock", type: "Equity", locked: false },
  { name: "Job Costing", type: "Cost Of Goods Sold", locked: false },
  { name: "Subcontractor", type: "Cost Of Goods Sold", locked: false },
  { name: "Materials", type: "Cost Of Goods Sold", locked: false },
  { name: "Labor", type: "Cost Of Goods Sold", locked: false },
  { name: "Distributions", type: "Equity", locked: false },
  { name: "Opening Balance Offset", type: "Equity", locked: true },
  { name: "Bank Fees and Charges", type: "Expense", locked: true },
  { name: "Discount", type: "Income", locked: true },
  { name: "Drawings", type: "Equity", locked: true },
  { name: "Office Supplies", type: "Expense", locked: false },
  { name: "Late Fee Income", type: "Income", locked: true },
  { name: "Interest Income", type: "Income", locked: true },
  { name: "General Income", type: "Income", locked: true },
  { name: "Sales", type: "Income", locked: true },
  { name: "Advertising And Marketing", type: "Expense", locked: false },
  { name: "Owner's Equity", type: "Equity", locked: true },
  { name: "Retained Earnings", type: "Equity", locked: true },
  { name: "Tax Payable", type: "Other Current Liability", locked: true },
  { name: "Accounts Payable", type: "Accounts Payable", locked: true },
  { name: "Advance Tax", type: "Other Current Asset", locked: true },
  { name: "Furniture and Equipment", type: "Fixed Asset", locked: false },
  { name: "Accounts Receivable", type: "Accounts Receivable", locked: true },
  { name: "Petty Cash", type: "Cash", locked: true },
  { name: "Salaries and Employee Wages", type: "Expense", locked: false },
  { name: "Other Expenses", type: "Expense", locked: true },
  { name: "Repairs and Maintenance", type: "Expense", locked: false },
  { name: "Consultant Expense", type: "Expense", locked: false },
  { name: "Depreciation Expense", type: "Expense", locked: false },
  { name: "Meals and Entertainment", type: "Expense", locked: false },
  { name: "Credit Card Charges", type: "Expense", locked: false },
  { name: "Printing and Stationery", type: "Expense", locked: false },
  { name: "Bad Debt", type: "Expense", locked: true },
  { name: "Postage", type: "Expense", locked: false },
  { name: "Janitorial Expense", type: "Expense", locked: false },
  { name: "Rent Expense", type: "Expense", locked: false },
  { name: "IT and Internet Expenses", type: "Expense", locked: false },
  { name: "Automobile Expense", type: "Expense", locked: false },
  { name: "Telephone Expense", type: "Expense", locked: false },
  { name: "Travel Expense", type: "Expense", locked: false },
  { name: "Exchange Gain or Loss", type: "Other Expense", locked: true },
  { name: "Reimbursements Payable", type: "Other Current Liability", locked: false, code: "Payroll-001" },
  { name: "Payroll Tax Payable", type: "Other Current Liability", locked: false, code: "Payroll-002" },
  { name: "Statutory Deductions Payable", type: "Other Current Liability", locked: false, code: "Payroll-003" },
  { name: "Deductions Payable", type: "Other Current Liability", locked: false, code: "Payroll-004" },
  { name: "Net Salary Payable", type: "Other Current Liability", locked: false, code: "Payroll-005" },
  { name: "Hold Salary Payable", type: "Other Current Liability", locked: false, code: "Payroll-006" },
];

const ACCOUNTANTS_DATA = [
  { name: "Prashant Lumdhe", firmName: "BHAKTI SERVICES.", country: "India", state: "Maharashtra", phone: "+91 771 993 6194", email: "bhaktiservices2012@gmail.com", partnerBadge: "Authorised Partner" },
  { name: "Mohommed Khalefa", firmName: "K-office Solutions Pvt Ltd", country: "India", state: "Karnataka", phone: "+91 9480179854", email: "support@koffice.in", partnerBadge: "Authorised Partner" },
  { name: "VINOD KUMAR s", firmName: "SNV & Associates Chartered Accountants", country: "India", state: "Kerala", phone: "8589955544", email: "vinodkumars1979@gmail.com", partnerBadge: "Authorised Partner" },
  { 
    name: "CA Chitkala Kulkarni", 
    firmName: "P. V. Page & Co.", 
    country: "India", 
    state: "Maharashtra",
    phone: "+91 9821323092", 
    email: "office_pvp@yahoo.com", 
    partnerBadge: "Authorised Partner",
    description: "Statutory Audit, Tax Audit, Internal Audit & Investigations, Tax Planning & Consultancy services, Accounting services, Secretarial and company law advisory services, Business and corporate advisory services, Advisory services to Government Departments and corporations etc..",
    servicesOffered: ["Accounts Payable", "Accounts Receivable", "Bank Reconciliation", "Bookkeeping", "Budgeting & Planning", "Financial Statement", "Monthly Accounting Services", "Year End Filing", "Zoho Books Setup", "Zoho Books Training"]
  },
];

const ACCOUNT_TYPE_META: Record<string, { internal_group: string; account_type: string }> = {
  "Accounts Payable": { internal_group: "liability", account_type: "liability_payable" },
  "Accounts Receivable": { internal_group: "asset", account_type: "asset_receivable" },
  "Accruals and Deferred Income": { internal_group: "liability", account_type: "liability_current" },
  "Bank": { internal_group: "asset", account_type: "asset_cash" },
  "Called-up Share Capital Not Paid": { internal_group: "asset", account_type: "asset_current" },
  "Cash": { internal_group: "asset", account_type: "asset_cash" },
  "Cost Of Goods Sold": { internal_group: "expense", account_type: "expense_direct_cost" },
  "Credit Card": { internal_group: "liability", account_type: "liability_credit_card" },
  "Deferred Tax Asset": { internal_group: "asset", account_type: "asset_non_current" },
  "Deferred Tax Liability": { internal_group: "liability", account_type: "liability_non_current" },
  "Equity": { internal_group: "equity", account_type: "equity" },
  "Expense": { internal_group: "expense", account_type: "expense" },
  "Fixed Asset": { internal_group: "asset", account_type: "asset_fixed" },
  "Income": { internal_group: "income", account_type: "income" },
  "Intangible Asset": { internal_group: "asset", account_type: "asset_fixed" },
  "Non Current Asset": { internal_group: "asset", account_type: "asset_non_current" },
  "Non Current Liability": { internal_group: "liability", account_type: "liability_non_current" },
  "Other Asset": { internal_group: "asset", account_type: "asset_current" },
  "Other Current Asset": { internal_group: "asset", account_type: "asset_current" },
  "Other Current Liability": { internal_group: "liability", account_type: "liability_current" },
  "Other Expense": { internal_group: "expense", account_type: "expense" },
  "Other Income": { internal_group: "income", account_type: "income_other" },
  "Other Liability": { internal_group: "liability", account_type: "liability_current" },
  "Overseas Tax Payable": { internal_group: "liability", account_type: "liability_current" },
  "Payment Clearing Account": { internal_group: "asset", account_type: "asset_current" },
  "Staff Cost": { internal_group: "expense", account_type: "expense" },
  "Stock": { internal_group: "asset", account_type: "asset_current" },
};

const CANONICAL_ACCOUNT_CODES: Record<string, string> = {
  "Accounts Receivable": "1200",
  "Accounts Payable": "2100",
  "TDS Receivable": "1210",
  "Inventory Asset": "1300",
  "Furniture and Equipment": "1400",
  "Petty Cash": "1110",
  "Undeposited Funds": "1105",
  "Tax Payable": "2160",
  "Owner's Equity": "3100",
  "Capital Stock": "3110",
  "Retained Earnings": "3200",
  "Sales": "4100",
  "Cost of Goods Sold": "5100",
  "Bank Fees and Charges": "5150",
  "Salaries and Employee Wages": "5200",
  "Depreciation Expense": "5300",
  "Depreciation And Amortisation": "5310",
  "Finished Goods": "1310",
  "Work In Progress": "1320",
  "Investments": "1500",
  "Prepaid Expenses": "1230",
  "Employee Advance": "1240",
  "Advance Tax": "1250",
  "Accrued Purchases": "2110",
  "Unearned Revenue": "2150",
  "Construction Loans": "2500",
  "Mortgages": "2510",
  "TDS Payable": "2180",
  "Opening Balance Adjustments": "2190",
  "Dimension Adjustments": "2195",
  "Employee Reimbursements": "2198",
  "General Income": "4200",
  "Shipping Charge": "4300",
  "Interest Income": "4400",
  "Late Fee Income": "4500",
  "Other Charges": "4600",
  "Discount": "4700",
  "Purchase Discounts": "5110",
  "Raw Materials And Consumables": "5120",
  "Job Costing": "5130",
  "Subcontractor": "5140",
  "Materials": "5160",
  "Labor": "5170",
  "Advertising And Marketing": "5400",
  "Office Supplies": "5410",
  "Repairs and Maintenance": "5420",
  "Consultant Expense": "5430",
  "Meals and Entertainment": "5440",
  "Credit Card Charges": "5450",
  "Printing and Stationery": "5460",
  "Bad Debt": "5470",
  "Postage": "5480",
  "Janitorial Expense": "5490",
  "Rent Expense": "5500",
  "IT and Internet Expenses": "5510",
  "Automobile Expense": "5520",
  "Telephone Expense": "5530",
  "Travel Expense": "5540",
  "Exchange Gain or Loss": "5550",
  "Fuel/Mileage Expenses": "5560",
  "Contract Assets": "1260",
  "Transportation Expense": "5570",
  "Lodging": "5580",
  "Merchandise": "5590",
  "Dividends Paid": "3300",
  "Distributions": "3310",
  "Opening Balance Offset": "3320",
  "Drawings": "3330",
  "Uncategorized": "5999",
  "Other Expenses": "5900",
};

export async function seedNewChartOfAccounts(tenantId: string, createdByUserId: string, session?: mongoose.ClientSession) {
  session ??= getAccountingSession();
  if (!mongoose.Types.ObjectId.isValid(createdByUserId)) {
    throw new Error("A valid user is required to initialize Chart of Accounts.");
  }

  const userId = new mongoose.Types.ObjectId(createdByUserId);

  // 1. Bulk Upsert Account Types
  const typeOps = ACCOUNT_TYPES_DATA.map((t) => ({
    updateOne: {
      filter: { tenantId, name: t.name },
      update: {
        $setOnInsert: {
          tenantId,
          name: t.name,
          segment: t.segment,
          description: t.description,
          isSystem: true,
          status: "active" as const,
          createdBy: userId,
        },
      },
      upsert: true,
    },
  }));
  await AccountType.bulkWrite(typeOps, { ordered: !session ? false : true, session });

  // Fetch all types to build the map
  const allTypes = await AccountType.find({ tenantId }, { name: 1, _id: 1 }).session(session || null);
  const typeMap = new Map<string, mongoose.Types.ObjectId>();
  allTypes.forEach((t) => typeMap.set(t.name, t._id as mongoose.Types.ObjectId));

  // 2. Upsert Accounts without creating duplicates
  for (let index = 0; index < ACCOUNTS_DATA.length; index++) {
    const a = ACCOUNTS_DATA[index];
    const accTypeId = typeMap.get(a.type);
    const specific = a.name === "Retained Earnings" ? { internal_group: "equity", account_type: "equity_unaffected" } : (a.name === "Depreciation Expense" || a.name === "Depreciation And Amortisation") ? { internal_group: "expense", account_type: "expense_depreciation" } : undefined;
    const meta = specific || ACCOUNT_TYPE_META[a.type] || { internal_group: "off_balance", account_type: "off_balance" };
    const canonicalCode = CANONICAL_ACCOUNT_CODES[a.name] || (a as any).code || undefined;

    // Look for existing account by code, accountName, or legacy name
    const existing = await Account.findOne({
      tenantId,
      $or: [
        ...(canonicalCode ? [{ code: canonicalCode }, { accountCode: canonicalCode }] : []),
        { accountName: a.name },
        { name: a.name },
        { name: { $regex: new RegExp(`^${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, "i") } },
        { accountName: { $regex: new RegExp(`^${a.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, "i") } },
      ],
    }).session(session || null);

    if (existing) {
      let changed = false;
      if (!existing.accountType && accTypeId) {
        existing.accountType = accTypeId;
        changed = true;
      }
      if (!existing.internal_group || existing.internal_group === "off_balance") {
        existing.internal_group = meta.internal_group;
        changed = true;
      }
      if (!existing.account_type || existing.account_type === "off_balance") {
        existing.account_type = meta.account_type;
        changed = true;
      }
      if (!existing.accountName) {
        existing.accountName = a.name;
        changed = true;
      }
      if (!existing.name) {
        existing.name = a.name;
        changed = true;
      }
      if (!existing.code && canonicalCode) {
        existing.code = canonicalCode;
        changed = true;
      }
      if (!existing.accountCode && canonicalCode) {
        existing.accountCode = canonicalCode;
        changed = true;
      }
      if (existing.isActive === undefined || existing.isActive === null) {
        existing.isActive = true;
        changed = true;
      }
      if (!existing.status) {
        existing.status = "active";
        changed = true;
      }
      if (meta.account_type === "asset_receivable" || meta.account_type === "liability_payable") {
        if (!existing.reconcile) {
          existing.reconcile = true;
          changed = true;
        }
      }
      if (changed) {
        await existing.save({ session });
      }
    } else {
      const stableCode = canonicalCode || (a as any).code || `SYS-${1000 + index}`;
      const data = {
        tenantId,
        accountName: a.name,
        name: a.name,
        code: stableCode,
        accountCode: stableCode,
        accountType: accTypeId,
        internal_group: meta.internal_group,
        account_type: meta.account_type,
        reconcile: meta.account_type === "asset_receivable" || meta.account_type === "liability_payable",
        isLocked: a.locked,
        isActive: true,
        status: "active",
        watchlist: false,
        createdBy: userId,
      };
      if (session) await Account.create([data], { session });
      else await Account.create(data);
    }
  }

  // 3. Seed Accountants (Global directory) - run outside session to prevent catalog changes in transactions
  try {
    const existingAccountants = await Accountant.countDocuments({});
    if (existingAccountants === 0) {
      const accountantOps = ACCOUNTANTS_DATA.map((acct) => ({
        insertOne: {
          document: acct,
        },
      }));
      await Accountant.bulkWrite(accountantOps, { ordered: false });
    }
  } catch (accountantErr) {
    console.warn("Notice: global accountants directory seeding skipped:", accountantErr);
  }
}

