import mongoose from "mongoose";
import AccountType from "@/models/AccountType";
import Account from "@/models/Account";
import Accountant from "@/models/Accountant";

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

export async function seedNewChartOfAccounts(tenantId: string, createdByUserId: string) {
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
  await AccountType.bulkWrite(typeOps, { ordered: false });

  // Fetch all types to build the map
  const allTypes = await AccountType.find({ tenantId }, { name: 1, _id: 1 });
  const typeMap = new Map();
  allTypes.forEach((t) => typeMap.set(t.name, t._id));

  // 2. Bulk Upsert Accounts
  const accountOps = ACCOUNTS_DATA.map((a, index) => {
    const accTypeId = typeMap.get(a.type);
    if (!accTypeId) {
      console.warn(`AccountType ${a.type} not found for account ${a.name}`);
    }
    
    return {
      updateOne: {
        filter: { tenantId, accountName: a.name },
        update: {
          $setOnInsert: {
            tenantId,
            accountName: a.name,
            accountCode: a.code || undefined,
            code: `SYS-${Date.now()}-${index}`, // Bypass legacy unique index
            name: a.name, // Keep legacy name in sync just in case
            accountType: accTypeId,
            isLocked: a.locked,
            isActive: true,
            status: "active" as const,
            watchlist: false,
            createdBy: userId,
          },
        },
        upsert: true,
      },
    };
  });
  
  if (accountOps.length > 0) {
    await Account.bulkWrite(accountOps, { ordered: false });
  }

  // 3. Seed Accountants (Global directory)
  const existingAccountants = await Accountant.countDocuments();
  if (existingAccountants === 0) {
    const accountantOps = ACCOUNTANTS_DATA.map((acct) => ({
      insertOne: {
        document: acct,
      },
    }));
    await Accountant.bulkWrite(accountantOps, { ordered: false });
  }
}

