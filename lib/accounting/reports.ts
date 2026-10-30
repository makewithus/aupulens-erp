import mongoose from "mongoose";
import JournalEntry from "@/models/finance/JournalEntry";
import AccountType from "@/models/finance/AccountType";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";
import { toDateEndInTimeZone, toDateStartInTimeZone } from "@/lib/accounting/reportDate";

export { toDateEndInTimeZone, toDateStartInTimeZone } from "@/lib/accounting/reportDate";

export type ReportGroup =
  | "asset"
  | "liability"
  | "equity"
  | "income"
  | "expense"
  | "off_balance";

export type ReportAccount = {
  id: string;
  code: string;
  name: string;
  accountType: string;
  internalGroup: ReportGroup;
  normalBalance?: "debit" | "credit";
  isContraAccount?: boolean;
  debit: number;
  credit: number;
  amount: number;
  entryCount?: number;
};

export type AccountGroupReport = {
  total: number;
  accounts: Record<string, ReportAccount>;
  current?: {
    total: number;
    accounts: Record<string, ReportAccount>;
  };
  nonCurrent?: {
    total: number;
    accounts: Record<string, ReportAccount>;
  };
};

export type StatementSummary = {
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMarginPercent: number;
  operatingExpenses: number;
  operatingIncome: number;
  otherIncome: number;
  otherExpenses: number;
  profitBeforeTax: number;
  taxExpense: number;
  netIncome: number;
  profitAvailable?: boolean;
  profitUnavailableReason?: string;
};

export type PostedJournalReport = Record<ReportGroup, AccountGroupReport> & {
  statementSummary?: StatementSummary;
  activity: {
    latestPostedDate: Date | null;
    postedEntryCount: number;
    unclassifiedLineCount: number;
  };
  totals: {
    debit: number;
    credit: number;
    balanced: boolean;
  };
};

const GROUP_TYPE_MAPPING: Record<string, ReportGroup> = {
  asset_receivable: "asset",
  asset_cash: "asset",
  asset_current: "asset",
  asset_non_current: "asset",
  asset_prepayments: "asset",
  asset_fixed: "asset",
  liability_payable: "liability",
  liability_credit_card: "liability",
  liability_current: "liability",
  liability_non_current: "liability",
  equity: "equity",
  equity_unaffected: "equity",
  income: "income",
  income_other: "income",
  expense: "expense",
  expense_depreciation: "expense",
  expense_direct_cost: "expense",
  off_balance: "off_balance",
};

export function resolveAccountGroupAndType(
  account: any,
  accountTypeMap?: Map<string, any>,
): {
  internalGroup: ReportGroup;
  accountType: string;
} {
  const name = (account.name || account.accountName || "").toLowerCase();
  const code = String(account.code || account.accountCode || "");
  const isBankOrCash = /\b(?:bank|cash)\b/.test(name);
  const isInventory = /\b(?:inventory|stock)\b/.test(name);

  // Legacy COA imports carry a useful `type` field alongside newer metadata.
  // Prefer that explicit legacy type when newer fields conflict (e.g. a
  // fixed-asset ledger accidentally tagged as equity by a code collision).
  if (account.type === "fixed_asset") {
    return { internalGroup: "asset", accountType: "asset_fixed" };
  }
  // Legacy fixed-asset ledgers can carry a conflicting modern AccountType
  // (for example code 1500 was once also used by the Investments seed). Resolve
  // these well-known asset codes/names before trusting that stale metadata.
  if (
    /^(14|15)/.test(code) &&
    /\b(?:machinery|equipment|vehicle|truck|furniture|fixed asset)\b/.test(name)
  ) {
    return { internalGroup: "asset", accountType: "asset_fixed" };
  }
  if (account.type === "bank" || isBankOrCash) {
    return { internalGroup: "asset", accountType: "asset_cash" };
  }
  if (isInventory) {
    return { internalGroup: "asset", accountType: "asset_current" };
  }
  if (/accounts\s+receivable/i.test(name)) {
    return { internalGroup: "asset", accountType: "asset_receivable" };
  }

  if (account.internal_group && account.account_type) {
    return {
      internalGroup: account.internal_group as ReportGroup,
      accountType: account.account_type,
    };
  }

  const at = account.accountType
    ? accountTypeMap?.get(String(account.accountType))
    : null;
  const segment = at?.segment || "";
  const atName = at?.name || "";

  // Legacy/imported COAs may store `type` instead of `account_type`; prefer
  // clear bank and inventory names before applying account-code conventions.
  if (
    segment === "Cash and cash equivalents" ||
    atName === "Bank" ||
    atName === "Cash"
  ) {
    return { internalGroup: "asset", accountType: "asset_cash" };
  }
  if (
    segment === "Other Current Asset" ||
    atName === "Accounts Receivable" ||
    atName === "Stock"
  ) {
    const isAr =
      atName === "Accounts Receivable" || name.includes("receivable");
    return {
      internalGroup: "asset",
      accountType: isAr ? "asset_receivable" : "asset_current",
    };
  }
  if (
    segment === "Fixed Asset" ||
    atName === "Fixed Asset" ||
    atName === "Intangible Asset"
  ) {
    return { internalGroup: "asset", accountType: "asset_fixed" };
  }
  if (segment === "Non Current Asset") {
    return { internalGroup: "asset", accountType: "asset_non_current" };
  }
  if (segment === "Other Asset") {
    return { internalGroup: "asset", accountType: "asset_current" };
  }

  if (
    segment === "Other Current Liability" ||
    atName === "Accounts Payable" ||
    atName === "Credit Card"
  ) {
    const isAp = atName === "Accounts Payable" || name.includes("payable");
    const isCc = atName === "Credit Card" || name.includes("credit card");
    return {
      internalGroup: "liability",
      accountType: isAp
        ? "liability_payable"
        : isCc
        ? "liability_credit_card"
        : "liability_current",
    };
  }
  if (segment === "Non Current Liability" || segment === "Other Liability") {
    return { internalGroup: "liability", accountType: "liability_non_current" };
  }

  if (segment === "Equity" || atName === "Equity") {
    return { internalGroup: "equity", accountType: "equity" };
  }
  if (
    segment === "Income" ||
    segment === "Other Income" ||
    atName === "Income"
  ) {
    return { internalGroup: "income", accountType: "income" };
  }
  if (
    segment === "Expense" ||
    segment === "Cost Of Goods Sold" ||
    segment === "Other Expense" ||
    atName === "Expense"
  ) {
    const isCogs =
      segment === "Cost Of Goods Sold" ||
      name.includes("cogs") ||
      name.includes("cost of goods");
    const isDep = name.includes("depreciation");
    return {
      internalGroup: "expense",
      accountType: isCogs
        ? "expense_direct_cost"
        : isDep
        ? "expense_depreciation"
        : "expense",
    };
  }

  if (account.account_type && GROUP_TYPE_MAPPING[account.account_type]) {
    return {
      internalGroup: GROUP_TYPE_MAPPING[account.account_type],
      accountType: account.account_type,
    };
  }

  if (code.startsWith("1")) {
    const isCash = code.startsWith("11");
    const isAr = code === "1200" && !isInventory;
    const isFixed = code.startsWith("14") || code.startsWith("15");
    return {
      internalGroup: "asset",
      accountType: isCash
        ? "asset_cash"
        : isAr
        ? "asset_receivable"
        : isFixed
        ? "asset_fixed"
        : "asset_current",
    };
  }
  if (code.startsWith("2")) {
    const isAp = code === "2100";
    const isNonCurrent =
      code.startsWith("25") ||
      code.startsWith("26") ||
      code.startsWith("27") ||
      code.startsWith("28");
    return {
      internalGroup: "liability",
      accountType: isAp
        ? "liability_payable"
        : isNonCurrent
        ? "liability_non_current"
        : "liability_current",
    };
  }
  if (code.startsWith("3")) {
    return { internalGroup: "equity", accountType: "equity" };
  }
  if (code.startsWith("4")) {
    return { internalGroup: "income", accountType: "income" };
  }
  if (code.startsWith("5") || code.startsWith("6")) {
    return { internalGroup: "expense", accountType: "expense" };
  }

  if (name.includes("bank") || name.includes("cash")) {
    return { internalGroup: "asset", accountType: "asset_cash" };
  }
  if (name.includes("receivable")) {
    return { internalGroup: "asset", accountType: "asset_receivable" };
  }
  if (
    name.includes("fixed asset") ||
    name.includes("machinery") ||
    name.includes("equipment") ||
    name.includes("vehicle") ||
    name.includes("truck")
  ) {
    return { internalGroup: "asset", accountType: "asset_fixed" };
  }
  if (name.includes("payable") || name.includes("tax")) {
    return { internalGroup: "liability", accountType: "liability_current" };
  }
  if (
    name.includes("loan") ||
    name.includes("mortgage") ||
    name.includes("borrowing") ||
    name.includes("debenture") ||
    name.includes("long term")
  ) {
    return { internalGroup: "liability", accountType: "liability_non_current" };
  }
  if (name.includes("capital") || name.includes("equity")) {
    return { internalGroup: "equity", accountType: "equity" };
  }
  if (
    name.includes("revenue") ||
    name.includes("sales") ||
    name.includes("income")
  ) {
    return { internalGroup: "income", accountType: "income" };
  }

  return {
    internalGroup: (account.internal_group || "off_balance") as ReportGroup,
    accountType: account.account_type || "unknown",
  };
}

function getSignedAmount(group: ReportGroup, debit: number, credit: number) {
  if (group === "asset" || group === "expense") {
    return debit - credit;
  }
  return credit - debit;
}

export async function buildPostedJournalReport({
  tenantId,
  startDate,
  endDate,
  endDateTimeZone = "UTC",
}: {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  /** Interpret the calendar date represented by endDate as an org-local day. */
  endDateTimeZone?: string;
}): Promise<PostedJournalReport> {
  const query: Record<string, any> = {
    tenantId,
    status: DOCUMENT_STATUS.POSTED,
  };

  if (startDate || endDate) {
    query["header.date"] = {};
    if (startDate) {
      const isPrecise = startDate.getUTCHours() !== 0 || startDate.getUTCMinutes() !== 0 || startDate.getUTCSeconds() !== 0;
      query["header.date"].$gte = isPrecise ? startDate : toDateStartInTimeZone(startDate, endDateTimeZone);
    }
    if (endDate) query["header.date"].$lte = toDateEndInTimeZone(endDate, endDateTimeZone);
  }

  const report: PostedJournalReport = {
    asset: { total: 0, accounts: {} },
    liability: { total: 0, accounts: {} },
    equity: { total: 0, accounts: {} },
    income: { total: 0, accounts: {} },
    expense: { total: 0, accounts: {} },
    off_balance: { total: 0, accounts: {} },
    totals: { debit: 0, credit: 0, balanced: true },
    activity: { latestPostedDate: null, postedEntryCount: 0, unclassifiedLineCount: 0 },
  };

  let accountTypeMap = new Map<string, any>();
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const accountTypes = await AccountType.find({ tenantId }).lean();
      accountTypeMap = new Map(
        accountTypes.map((t: any) => [String(t._id), t]),
      );
    }
  } catch {
    // Ignore when running in isolated test environments
  }

  const entries = await JournalEntry.find(query)
    .populate("lineIds.accountId")
    .lean();

  report.activity.postedEntryCount = entries.length;
  for (const entry of entries) {
    const entryDate = entry.header?.date ? new Date(entry.header.date) : null;
    if (entryDate && !Number.isNaN(entryDate.getTime()) &&
      (!report.activity.latestPostedDate || entryDate > report.activity.latestPostedDate)) {
      report.activity.latestPostedDate = entryDate;
    }
  }

  const accountEntryMap = new Map<string, Set<string>>();

  for (const entry of entries) {
    for (const line of entry.lineIds || []) {
      const account = line.accountId as any;
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      // Journal balance is a property of the posted lines, even when a legacy
      // account reference no longer resolves during populate. Count every
      // line in the control total, then skip only its account classification.
      report.totals.debit += debit;
      report.totals.credit += credit;
      if (!account || (account.tenantId && String(account.tenantId) !== tenantId)) {
        report.activity.unclassifiedLineCount += 1;
        continue;
      }

      const { internalGroup, accountType } = resolveAccountGroupAndType(
        account,
        accountTypeMap,
      );
      const group = report[internalGroup] || report.off_balance;
      const id = account._id?.toString() || String(line.accountId);
      const codeKey = account.code || account.accountCode || id;
      // Account codes are expected to be unique, but imported/legacy account
      // records can violate that assumption. Keep distinct ledgers visible.
      const key = group.accounts[codeKey] && group.accounts[codeKey].id !== id
        ? `${codeKey}#${id}`
        : codeKey;
      const name = account.name || account.accountName || "Unknown Account";

      if (!group.accounts[key]) {
        group.accounts[key] = {
          id,
          code: account.code || account.accountCode || "N/A",
          name,
          accountType,
          internalGroup,
          normalBalance: account.normal_balance === "debit" || account.normal_balance === "credit"
            ? account.normal_balance
            : undefined,
          isContraAccount: account.is_contra_account === true,
          debit: 0,
          credit: 0,
          amount: 0,
          entryCount: 0,
        };
      }

      const target = group.accounts[key];
      target.debit += debit;
      target.credit += credit;
      target.amount = getSignedAmount(internalGroup, target.debit, target.credit);

      if (!accountEntryMap.has(key)) accountEntryMap.set(key, new Set());
      if (entry._id) accountEntryMap.get(key)!.add(String(entry._id));
      target.entryCount = accountEntryMap.get(key)!.size;
    }
  }

  const groupNames: ReportGroup[] = [
    "asset",
    "liability",
    "equity",
    "income",
    "expense",
    "off_balance",
  ];

  for (const groupName of groupNames) {
    const group = report[groupName];
    group.total = Object.values(group.accounts).reduce(
      (sum, account) => sum + account.amount,
      0,
    );

    if (groupName === "asset") {
      const currentAccounts: Record<string, ReportAccount> = {};
      const nonCurrentAccounts: Record<string, ReportAccount> = {};
      for (const [k, acc] of Object.entries(group.accounts)) {
        const nameLower = acc.name.toLowerCase();
        const isNonCurrent =
          acc.accountType === "asset_fixed" ||
          acc.accountType === "asset_non_current" ||
          String(acc.code).startsWith("14") ||
          String(acc.code).startsWith("15") ||
          nameLower.includes("fixed asset") ||
          nameLower.includes("machinery") ||
          nameLower.includes("equipment") ||
          nameLower.includes("vehicle") ||
          nameLower.includes("truck");
        if (isNonCurrent) {
          nonCurrentAccounts[k] = acc;
        } else {
          currentAccounts[k] = acc;
        }
      }
      group.current = {
        accounts: currentAccounts,
        total: Object.values(currentAccounts).reduce((s, a) => s + a.amount, 0),
      };
      group.nonCurrent = {
        accounts: nonCurrentAccounts,
        total: Object.values(nonCurrentAccounts).reduce((s, a) => s + a.amount, 0),
      };
    }

    if (groupName === "liability") {
      const currentAccounts: Record<string, ReportAccount> = {};
      const nonCurrentAccounts: Record<string, ReportAccount> = {};
      for (const [k, acc] of Object.entries(group.accounts)) {
        const nameLower = acc.name.toLowerCase();
        const isNonCurrent =
          acc.accountType === "liability_non_current" ||
          nameLower.includes("loan") ||
          nameLower.includes("mortgage") ||
          nameLower.includes("long term") ||
          nameLower.includes("borrowing") ||
          nameLower.includes("debenture");
        if (isNonCurrent) {
          nonCurrentAccounts[k] = acc;
        } else {
          currentAccounts[k] = acc;
        }
      }
      group.current = {
        accounts: currentAccounts,
        total: Object.values(currentAccounts).reduce((s, a) => s + a.amount, 0),
      };
      group.nonCurrent = {
        accounts: nonCurrentAccounts,
        total: Object.values(nonCurrentAccounts).reduce((s, a) => s + a.amount, 0),
      };
    }
  }

  // ── Multi-Step Statement Breakdown (GAAP / Ind AS) ──
  const incomeAccountsList = Object.values(report.income.accounts);
  const expenseAccountsList = Object.values(report.expense.accounts);

  const isOtherIncome = (acc: ReportAccount) => {
    const name = acc.name.toLowerCase();
    return acc.accountType === "income_other" ||
      acc.code.startsWith("49") ||
      name.includes("other income") ||
      name.includes("interest income") ||
      name.includes("dividend");
  };

  const isCogs = (acc: ReportAccount) => {
    const name = acc.name.toLowerCase();
    return acc.accountType === "expense_direct_cost" ||
      acc.code.startsWith("51") ||
      name.includes("cogs") ||
      name.includes("cost of goods") ||
      name.includes("direct cost") ||
      name.includes("cost of sales");
  };

  const isTaxExpense = (acc: ReportAccount) => {
    const name = acc.name.toLowerCase();
    return name.includes("income tax") ||
      name.includes("tax expense") ||
      name.includes("provision for tax") ||
      name.includes("corporate tax");
  };

  const isOtherExpense = (acc: ReportAccount) => {
    const name = acc.name.toLowerCase();
    return name.includes("interest expense") ||
      name.includes("finance cost") ||
      name.includes("bank charge") ||
      name.includes("other expense");
  };

  let revenue = 0;
  let otherIncome = 0;
  for (const acc of incomeAccountsList) {
    if (isOtherIncome(acc)) {
      otherIncome += acc.amount;
    } else {
      revenue += acc.amount;
    }
  }

  let cogs = 0;
  let operatingExpenses = 0;
  let otherExpenses = 0;
  let taxExpense = 0;

  for (const acc of expenseAccountsList) {
    if (isCogs(acc)) {
      cogs += acc.amount;
    } else if (isTaxExpense(acc)) {
      taxExpense += acc.amount;
    } else if (isOtherExpense(acc)) {
      otherExpenses += acc.amount;
    } else {
      operatingExpenses += acc.amount;
    }
  }

  revenue = Number(revenue.toFixed(2));
  cogs = Number(cogs.toFixed(2));
  otherIncome = Number(otherIncome.toFixed(2));
  operatingExpenses = Number(operatingExpenses.toFixed(2));
  otherExpenses = Number(otherExpenses.toFixed(2));
  taxExpense = Number(taxExpense.toFixed(2));

  const hasRecordedCosts = cogs > 0 || operatingExpenses > 0;
  const grossProfit = Number((revenue - cogs).toFixed(2));
  const isProfitComplete = revenue === 0 || hasRecordedCosts;
  const grossMarginPercent = (revenue !== 0 && isProfitComplete) ? Number(((grossProfit / revenue) * 100).toFixed(2)) : null;
  const operatingIncome = Number((grossProfit - operatingExpenses).toFixed(2));
  const profitBeforeTax = Number((operatingIncome + otherIncome - otherExpenses).toFixed(2));
  const netIncome = Number((profitBeforeTax - taxExpense).toFixed(2));

  report.statementSummary = {
    revenue,
    cogs,
    grossProfit,
    grossMarginPercent,
    operatingExpenses,
    operatingIncome,
    otherIncome,
    otherExpenses,
    profitBeforeTax,
    taxExpense,
    netIncome,
    profitAvailable: isProfitComplete,
    profitUnavailableReason: !isProfitComplete
      ? "Cost of goods sold and operating expenses have not been posted to the general ledger"
      : undefined,
  };

  report.totals.debit = Number(report.totals.debit.toFixed(2));
  report.totals.credit = Number(report.totals.credit.toFixed(2));
  report.totals.balanced =
    Math.abs(report.totals.debit - report.totals.credit) <= 0.01;

  return report;
}

/**
 * AI-14 (docs/ai/BRIEF-05-BATCH-D.md) — a pure, additive extension: `buildPostedJournalReport()`
 * gives account-level totals only (confirmed, not assumed, before this was added — no line-level
 * detail exists anywhere else to drill into). This reads the same posted `JournalEntry` lines for
 * ONE account over a date range, keeping enough detail (counterparty, entry id, date, amount) for
 * a caller to decompose a movement into drivers and cite the specific transactions behind it.
 * Never called by `buildPostedJournalReport()` itself and never changes its output.
 */
export interface AccountTransactionLine {
  entryId: string;
  entryName: string;
  date: string;
  partnerId: string | null;
  partnerName: string | null;
  label: string;
  signedAmount: number;
  /** The document this line was posted from, when the posting path set one (e.g. a vendor bill
   *  posting sets `sourceId` to its own Invoice _id — app/api/accounting/invoices/[id]/route.ts).
   *  Additive (docs/ai/BRIEF-06-BATCH-E.md Part 0.4) — lets a caller trace a line back to a
   *  source document (AI-14 uses it to ask AI-28's evaluateCutoff() whether a driver is a real
   *  timing difference) without a second query. `null` when the line has no such link. */
  sourceId: string | null;
}

export async function getAccountTransactionDetail({
  tenantId,
  accountId,
  startDate,
  endDate,
}: {
  tenantId: string;
  accountId: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<AccountTransactionLine[]> {
  const query: Record<string, any> = { tenantId, status: DOCUMENT_STATUS.POSTED };
  if (startDate || endDate) {
    query["header.date"] = {};
    if (startDate) query["header.date"].$gte = startDate;
    if (endDate) query["header.date"].$lte = toDateEndInTimeZone(endDate, "UTC");
  }

  const entries = await JournalEntry.find(query).populate("lineIds.accountId").populate("lineIds.partnerId").lean();
  const lines: AccountTransactionLine[] = [];

  for (const entry of entries) {
    for (const line of entry.lineIds || []) {
      const account = line.accountId as any;
      if (!account || String(account._id) !== accountId) continue;

      const internalGroup = (account.internal_group || "off_balance") as ReportGroup;
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      const partner = line.partnerId as any;

      lines.push({
        entryId: String(entry._id),
        entryName: entry.header?.name || "",
        date: new Date(entry.header?.date ?? entry.createdAt).toISOString(),
        partnerId: partner?._id ? String(partner._id) : null,
        partnerName: partner?.header?.displayName || partner?.header?.name || null,
        label: line.label || "",
        signedAmount: getSignedAmount(internalGroup, debit, credit),
        sourceId: line.sourceId ? String(line.sourceId) : null,
      });
    }
  }

  return lines;
}

export type AgedReportType = "receivable" | "payable";

export type AgingBucket = "current" | "1-30" | "31-60" | "61-90" | "90+";

export type AgedPartnerReportItem = Record<AgingBucket, number> & {
  partnerId: string;
  partnerName: string;
  total: number;
  unappliedCredits: number;
};

export type AgedPartnerReport = {
  accountingBasis: "posted_journal_entries";
  type: AgedReportType;
  asOfDate: string;
  items: AgedPartnerReportItem[];
  totals: Record<AgingBucket, number> & {
    total: number;
    unappliedCredits: number;
  };
  validation: {
    postedLineCount: number;
    accountType: "asset_receivable" | "liability_payable";
  };
};

export type LedgerGroupBy = "day" | "month";

export type CashFlowTotals = {
  inflow: number;
  outflow: number;
  net: number;
};

export type CashFlowSeriesItem = CashFlowTotals & {
  date: string;
};

export type DebitCreditSeriesItem = {
  date: string;
  debit: number;
  credit: number;
};

export type IncomeExpenseSeriesItem = {
  date: string;
  revenue: number;
  expenses: number;
};

type OpenItem = {
  maturityDate: Date;
  amount: number;
};

type PartnerAgingBucket = {
  partnerId: string;
  partnerName: string;
  openItems: OpenItem[];
  unappliedCredits: number;
};

const agingBuckets: AgingBucket[] = [
  "current",
  "1-30",
  "31-60",
  "61-90",
  "90+",
];

function emptyAgedAmounts(): Record<AgingBucket, number> {
  return {
    current: 0,
    "1-30": 0,
    "31-60": 0,
    "61-90": 0,
    "90+": 0,
  };
}

function roundMoney(value: number) {
  return Number(value.toFixed(2));
}

function startOfDay(date: Date) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  return normalized;
}

function getAgingBucket(maturityDate: Date, asOfDate: Date): AgingBucket {
  const diffMs = startOfDay(asOfDate).getTime() - startOfDay(maturityDate).getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays <= 0) return "current";
  if (diffDays <= 30) return "1-30";
  if (diffDays <= 60) return "31-60";
  if (diffDays <= 90) return "61-90";
  return "90+";
}

function getPartnerName(partner: any) {
  return partner?.header?.name || partner?.name || "Unknown Partner";
}

function getPeriodKey(date: Date, groupBy: LedgerGroupBy = "day") {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");

  if (groupBy === "month") {
    return `${year}-${month}`;
  }

  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getMonthLabel(key: string) {
  const [, month] = key.split("-");
  const monthIndex = Number(month) - 1;
  return Number.isInteger(monthIndex)
    ? new Date(2000, monthIndex, 1).toLocaleString("en", { month: "short" })
    : key;
}

function getDisplayPeriod(key: string, groupBy: LedgerGroupBy = "day") {
  return groupBy === "month" ? getMonthLabel(key) : key;
}

async function getPostedEntriesWithAccounts({
  tenantId,
  startDate,
  endDate,
}: {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const query: Record<string, any> = {
    tenantId,
    status: DOCUMENT_STATUS.POSTED,
  };

  if (startDate || endDate) {
    query["header.date"] = {};
    if (startDate) query["header.date"].$gte = startDate;
    if (endDate) query["header.date"].$lte = toDateEndInTimeZone(endDate, "UTC");
  }

  return JournalEntry.find(query)
    .sort({ "header.date": 1 })
    .populate("lineIds.accountId")
    .lean();
}

export async function buildPostedCashFlowTotals({
  tenantId,
  startDate,
  endDate,
}: {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<CashFlowTotals> {
  const entries = await getPostedEntriesWithAccounts({
    tenantId,
    startDate,
    endDate,
  });

  const totals = { inflow: 0, outflow: 0, net: 0 };

  for (const entry of entries) {
    for (const line of entry.lineIds || []) {
      const account = line.accountId as any;
      if (account?.account_type !== "asset_cash") continue;

      totals.inflow += Number(line.debit) || 0;
      totals.outflow += Number(line.credit) || 0;
    }
  }

  totals.inflow = roundMoney(totals.inflow);
  totals.outflow = roundMoney(totals.outflow);
  totals.net = roundMoney(totals.inflow - totals.outflow);
  return totals;
}

export async function buildPostedCashFlowSeries({
  tenantId,
  startDate,
  endDate,
  groupBy = "day",
}: {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  groupBy?: LedgerGroupBy;
}): Promise<CashFlowSeriesItem[]> {
  const entries = await getPostedEntriesWithAccounts({
    tenantId,
    startDate,
    endDate,
  });
  const byDate = new Map<string, CashFlowSeriesItem>();

  for (const entry of entries) {
    const key = getPeriodKey(new Date(entry.header?.date || new Date()), groupBy);
    if (!byDate.has(key)) {
      byDate.set(key, {
        date: getDisplayPeriod(key, groupBy),
        inflow: 0,
        outflow: 0,
        net: 0,
      });
    }

    const target = byDate.get(key)!;
    for (const line of entry.lineIds || []) {
      const account = line.accountId as any;
      if (account?.account_type !== "asset_cash") continue;

      target.inflow += Number(line.debit) || 0;
      target.outflow += Number(line.credit) || 0;
      target.net = target.inflow - target.outflow;
    }
  }

  return Array.from(byDate.entries()).map(([, item]) => ({
    date: item.date,
    inflow: roundMoney(item.inflow),
    outflow: roundMoney(item.outflow),
    net: roundMoney(item.net),
  }));
}

export async function buildPostedDebitCreditSeries({
  tenantId,
  startDate,
  endDate,
  groupBy = "day",
}: {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  groupBy?: LedgerGroupBy;
}): Promise<DebitCreditSeriesItem[]> {
  const entries = await getPostedEntriesWithAccounts({
    tenantId,
    startDate,
    endDate,
  });
  const byDate = new Map<string, DebitCreditSeriesItem>();

  for (const entry of entries) {
    const key = getPeriodKey(new Date(entry.header?.date || new Date()), groupBy);
    if (!byDate.has(key)) {
      byDate.set(key, {
        date: getDisplayPeriod(key, groupBy),
        debit: 0,
        credit: 0,
      });
    }

    const target = byDate.get(key)!;
    for (const line of entry.lineIds || []) {
      target.debit += Number(line.debit) || 0;
      target.credit += Number(line.credit) || 0;
    }
  }

  return Array.from(byDate.values()).map((item) => ({
    date: item.date,
    debit: roundMoney(item.debit),
    credit: roundMoney(item.credit),
  }));
}

export async function buildPostedIncomeExpenseSeries({
  tenantId,
  startDate,
  endDate,
  groupBy = "day",
}: {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
  groupBy?: LedgerGroupBy;
}): Promise<IncomeExpenseSeriesItem[]> {
  const entries = await getPostedEntriesWithAccounts({
    tenantId,
    startDate,
    endDate,
  });
  const byDate = new Map<string, IncomeExpenseSeriesItem>();

  for (const entry of entries) {
    const key = getPeriodKey(new Date(entry.header?.date || new Date()), groupBy);
    if (!byDate.has(key)) {
      byDate.set(key, {
        date: getDisplayPeriod(key, groupBy),
        revenue: 0,
        expenses: 0,
      });
    }

    const target = byDate.get(key)!;
    for (const line of entry.lineIds || []) {
      const account = line.accountId as any;
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;

      if (account?.internal_group === "income") {
        target.revenue += credit - debit;
      }
      if (account?.internal_group === "expense") {
        target.expenses += debit - credit;
      }
    }
  }

  return Array.from(byDate.values()).map((item) => ({
    date: item.date,
    revenue: roundMoney(item.revenue),
    expenses: roundMoney(item.expenses),
  }));
}

export async function buildPostedCategoryBreakdown({
  tenantId,
  startDate,
  endDate,
}: {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
}) {
  const entries = await getPostedEntriesWithAccounts({
    tenantId,
    startDate,
    endDate,
  });
  const totals = new Map<string, number>();

  for (const entry of entries) {
    for (const line of entry.lineIds || []) {
      const account = line.accountId as any;
      if (!account) continue;

      const group = account.internal_group || "off_balance";
      const amount = Math.abs((Number(line.debit) || 0) - (Number(line.credit) || 0));
      totals.set(group, (totals.get(group) || 0) + amount);
    }
  }

  return Array.from(totals.entries()).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1),
    value: Math.round(value),
  }));
}

export async function buildAgedPartnerReport({
  tenantId,
  type,
  asOfDate = new Date(),
}: {
  tenantId: string;
  type: AgedReportType;
  asOfDate?: Date;
}): Promise<AgedPartnerReport> {
  const accountType =
    type === "receivable" ? "asset_receivable" : "liability_payable";

  const entries = await JournalEntry.find({
    tenantId,
    status: DOCUMENT_STATUS.POSTED,
    "header.date": { $lte: toDateEndInTimeZone(asOfDate, "UTC") },
  })
    .populate("lineIds.accountId")
    .populate("lineIds.partnerId")
    .lean();

  const partners: Record<string, PartnerAgingBucket> = {};
  let postedLineCount = 0;

  for (const entry of entries) {
    for (const line of entry.lineIds || []) {
      const account = line.accountId as any;
      if (!account || account.account_type !== accountType) continue;

      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      const amount = type === "receivable" ? debit - credit : credit - debit;
      if (Math.abs(amount) <= 0.005) continue;

      const partner = line.partnerId as any;
      const partnerId = partner?._id?.toString() || "unknown";
      if (!partners[partnerId]) {
        partners[partnerId] = {
          partnerId,
          partnerName: getPartnerName(partner),
          openItems: [],
          unappliedCredits: 0,
        };
      }

      postedLineCount += 1;

      if (amount > 0) {
        partners[partnerId].openItems.push({
          maturityDate: line.maturityDate
            ? new Date(line.maturityDate)
            : new Date(entry.header?.date || asOfDate),
          amount,
        });
      } else {
        partners[partnerId].unappliedCredits += Math.abs(amount);
      }
    }
  }

  // If no partner-tagged journal lines were found (e.g. standard COA where receivables/payables
  // are tracked at document level or under broader current asset/liability accounts),
  // aggregate real aging from unpaid operational documents so reports and ratios are authentic.
  if (postedLineCount === 0) {
    if (type === "receivable") {
      const { SalesInvoice } = await import("@/models/sales/SalesInvoice");
      const unpaidSalesInvoices = await SalesInvoice.find({
        tenantId,
        paymentStatus: { $ne: "paid" },
        status: { $nin: ["cancelled", "draft"] },
      }).populate("customerId").lean();

      for (const inv of unpaidSalesInvoices as any[]) {
        const due = inv.amountDue !== undefined ? inv.amountDue : (inv.totalAmount - (inv.amountPaid || 0));
        if (due <= 0.005) continue;
        const customerRef = inv.customerId as any;
        const partnerId = customerRef?._id?.toString() || inv.customer || "unknown";
        const partnerName = customerRef?.name || customerRef?.companyName || inv.customer || "Customer";
        if (!partners[partnerId]) {
          partners[partnerId] = {
            partnerId,
            partnerName,
            openItems: [],
            unappliedCredits: 0,
          };
        }
        postedLineCount += 1;
        const maturityDate = inv.dueDate ? new Date(inv.dueDate) : new Date(inv.invoiceDate || inv.createdAt);
        partners[partnerId].openItems.push({ maturityDate, amount: due });
      }
    } else {
      const Invoice = (await import("@/models/finance/Invoice")).default;
      const unpaidBills = await Invoice.find({
        tenantId,
        moveType: "in_invoice",
        state: DOCUMENT_STATUS.POSTED,
      }).populate("partnerId").lean();

      for (const bill of unpaidBills as any[]) {
        const due = bill.amountResidual !== undefined ? bill.amountResidual : (bill.amountTotal || 0);
        if (due <= 0.005) continue;
        const partner = bill.partnerId as any;
        const partnerId = partner?._id?.toString() || "unknown";
        const partnerName = partner?.header?.name || partner?.name || "Vendor";
        if (!partners[partnerId]) {
          partners[partnerId] = {
            partnerId,
            partnerName,
            openItems: [],
            unappliedCredits: 0,
          };
        }
        postedLineCount += 1;
        const maturityDate = bill.invoiceDateDue ? new Date(bill.invoiceDateDue) : new Date(bill.invoiceDate || bill.createdAt);
        partners[partnerId].openItems.push({ maturityDate, amount: due });
      }
    }
  }

  const totals = {
    ...emptyAgedAmounts(),
    total: 0,
    unappliedCredits: 0,
  };

  const items = Object.values(partners)
    .map((partner) => {
      const agedAmounts = emptyAgedAmounts();
      let remainingCredits = partner.unappliedCredits;

      const sortedItems = partner.openItems.sort(
        (a, b) => a.maturityDate.getTime() - b.maturityDate.getTime(),
      );

      for (const item of sortedItems) {
        let openAmount = item.amount;
        if (remainingCredits > 0) {
          const appliedCredit = Math.min(openAmount, remainingCredits);
          openAmount -= appliedCredit;
          remainingCredits -= appliedCredit;
        }

        if (openAmount <= 0.005) continue;

        const bucket = getAgingBucket(item.maturityDate, asOfDate);
        agedAmounts[bucket] += openAmount;
      }

      const roundedBuckets = emptyAgedAmounts();
      let total = 0;
      for (const bucket of agingBuckets) {
        roundedBuckets[bucket] = roundMoney(agedAmounts[bucket]);
        total += roundedBuckets[bucket];
        totals[bucket] += roundedBuckets[bucket];
      }

      const unappliedCredits = roundMoney(remainingCredits);
      totals.total += total;
      totals.unappliedCredits += unappliedCredits;

      return {
        partnerId: partner.partnerId,
        partnerName: partner.partnerName,
        ...roundedBuckets,
        total: roundMoney(total),
        unappliedCredits,
      };
    })
    .filter((item) => item.total > 0 || item.unappliedCredits > 0)
    .sort((a, b) => b.total - a.total);

  for (const bucket of agingBuckets) {
    totals[bucket] = roundMoney(totals[bucket]);
  }
  totals.total = roundMoney(totals.total);
  totals.unappliedCredits = roundMoney(totals.unappliedCredits);

  return {
    accountingBasis: "posted_journal_entries",
    type,
    asOfDate: toDateEndInTimeZone(asOfDate, "UTC").toISOString(),
    items,
    totals,
    validation: {
      postedLineCount,
      accountType,
    },
  };
}
