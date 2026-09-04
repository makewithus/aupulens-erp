import JournalEntry from "@/models/finance/JournalEntry";
import { DOCUMENT_STATUS } from "@/lib/constants/statuses";

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
  debit: number;
  credit: number;
  amount: number;
};

export type AccountGroupReport = {
  total: number;
  accounts: Record<string, ReportAccount>;
};

export type PostedJournalReport = Record<ReportGroup, AccountGroupReport> & {
  totals: {
    debit: number;
    credit: number;
    balanced: boolean;
  };
};

function getSignedAmount(group: ReportGroup, debit: number, credit: number) {
  if (group === "asset" || group === "expense") {
    return debit - credit;
  }
  return credit - debit;
}

function toDateEnd(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

export async function buildPostedJournalReport({
  tenantId,
  startDate,
  endDate,
}: {
  tenantId: string;
  startDate?: Date;
  endDate?: Date;
}): Promise<PostedJournalReport> {
  const query: Record<string, any> = {
    tenantId,
    status: DOCUMENT_STATUS.POSTED,
  };

  if (startDate || endDate) {
    query["header.date"] = {};
    if (startDate) query["header.date"].$gte = startDate;
    if (endDate) query["header.date"].$lte = toDateEnd(endDate);
  }

  const report: PostedJournalReport = {
    asset: { total: 0, accounts: {} },
    liability: { total: 0, accounts: {} },
    equity: { total: 0, accounts: {} },
    income: { total: 0, accounts: {} },
    expense: { total: 0, accounts: {} },
    off_balance: { total: 0, accounts: {} },
    totals: { debit: 0, credit: 0, balanced: true },
  };

  const entries = await JournalEntry.find(query)
    .populate("lineIds.accountId")
    .lean();

  for (const entry of entries) {
    for (const line of entry.lineIds || []) {
      const account = line.accountId as any;
      if (!account) continue;

      const internalGroup = (account.internal_group || "off_balance") as ReportGroup;
      const group = report[internalGroup] || report.off_balance;
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;
      const id = account._id?.toString() || String(line.accountId);
      const key = account.code || id;

      report.totals.debit += debit;
      report.totals.credit += credit;

      if (!group.accounts[key]) {
        group.accounts[key] = {
          id,
          code: account.code || "N/A",
          name: account.name || "Unknown Account",
          accountType: account.account_type || "unknown",
          internalGroup,
          debit: 0,
          credit: 0,
          amount: 0,
        };
      }

      const target = group.accounts[key];
      target.debit += debit;
      target.credit += credit;
      target.amount = getSignedAmount(internalGroup, target.debit, target.credit);
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
  }

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
    if (endDate) query["header.date"].$lte = toDateEnd(endDate);
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
    if (endDate) query["header.date"].$lte = toDateEnd(endDate);
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
    "header.date": { $lte: toDateEnd(asOfDate) },
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
    asOfDate: toDateEnd(asOfDate).toISOString(),
    items,
    totals,
    validation: {
      postedLineCount,
      accountType,
    },
  };
}
