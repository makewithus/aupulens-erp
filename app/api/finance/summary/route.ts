import { safeInternalErrorMessage } from "@/lib/api/safeInternalErrorMessage";
import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Invoice from "@/models/finance/Invoice";
import {
  buildAgedPartnerReport,
  buildPostedCashFlowTotals,
  buildPostedCashFlowSeries,
  buildPostedJournalReport,
  buildPostedIncomeExpenseSeries,
} from "@/lib/accounting/reports";
import { getCachedData, setCachedData } from "@/lib/api/serverCache";

export async function GET() {
  try {
    const session = await auth();
    if (
      !session ||
      (session.user.role !== "admin" && session.user.role !== "finance")
    ) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await connectDB();
    const tenantIdGuard = requireTenantId(session);
    if (tenantIdGuard) return tenantIdGuard;
    const tenantId = (session.user as any).tenantId;

    const cacheKey = `finance_summary:${tenantId}`;
    const cached = getCachedData<any>(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Time ranges for tracking both authoritative all-time financial ledger metrics
    // and rolling 30-day velocity/comparisons.
    const now = new Date();
    const currentPeriodStart = new Date(now);
    currentPeriodStart.setDate(currentPeriodStart.getDate() - 29);
    const prevPeriodEnd = new Date(currentPeriodStart);
    prevPeriodEnd.setDate(prevPeriodEnd.getDate() - 1);
    const prevPeriodStart = new Date(prevPeriodEnd);
    prevPeriodStart.setDate(prevPeriodStart.getDate() - 29);

    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);

    const [
      allTimeJournalReport,
      currentJournalReport,
      prevJournalReport,
      allTimeCash,
      currentCash,
      prevCash,
      receivableAging,
      payableAging,
      monthlySeries,
      dailyCashSeries,
    ] = await Promise.all([
      buildPostedJournalReport({
        tenantId,
      }),
      buildPostedJournalReport({
        tenantId,
        startDate: currentPeriodStart,
      }),
      buildPostedJournalReport({
        tenantId,
        startDate: prevPeriodStart,
        endDate: prevPeriodEnd,
      }),
      buildPostedCashFlowTotals({
        tenantId,
      }),
      buildPostedCashFlowTotals({
        tenantId,
        startDate: currentPeriodStart,
      }),
      buildPostedCashFlowTotals({
        tenantId,
        startDate: prevPeriodStart,
        endDate: prevPeriodEnd,
      }),
      buildAgedPartnerReport({
        tenantId,
        type: "receivable",
        asOfDate: now,
      }),
      buildAgedPartnerReport({
        tenantId,
        type: "payable",
        asOfDate: now,
      }),
      buildPostedIncomeExpenseSeries({
        tenantId,
        startDate: twelveMonthsAgo,
        groupBy: "month",
      }),
      buildPostedCashFlowSeries({
        tenantId,
        startDate: twelveMonthsAgo,
        groupBy: "day",
      }),
    ]);

    // Primary Authoritative Financial KPIs (All-Time Posted Accounting Ledger)
    const allTimeRevenue = allTimeJournalReport.income.total;
    const allTimeExpenses = allTimeJournalReport.expense.total;
    const allTimeNetIncome = allTimeRevenue - allTimeExpenses;

    // Rolling 30-day velocity & comparison
    const m30Revenue = currentJournalReport.income.total;
    const prevRevenue = prevJournalReport.income.total;
    const m30Expenses = currentJournalReport.expense.total;
    const prevExpenses = prevJournalReport.expense.total;
    const currentCashFlow = currentCash.net;
    const prevCashFlow = prevCash.net;
    const m30NetIncome = m30Revenue - m30Expenses;
    const prevNetIncome = prevRevenue - prevExpenses;

    const receivables = {
      total: receivableAging.totals.total,
      overdue:
        (receivableAging.totals["1-30"] || 0) +
        (receivableAging.totals["31-60"] || 0) +
        (receivableAging.totals["61-90"] || 0) +
        (receivableAging.totals["90+"] || 0),
      buckets: [
        { label: "Current (0-30)", amount: receivableAging.totals.current || 0, risk: "low" },
        { label: "31-60 Days", amount: receivableAging.totals["1-30"] || 0, risk: "medium" },
        { label: "61-90 Days", amount: receivableAging.totals["31-60"] || 0, risk: "high" },
        { label: "91-120 Days", amount: receivableAging.totals["61-90"] || 0, risk: "critical" },
        { label: "120+ Days", amount: receivableAging.totals["90+"] || 0, risk: "critical" },
      ],
    };

    const payables = {
      total: payableAging.totals.total,
      overdue:
        (payableAging.totals["1-30"] || 0) +
        (payableAging.totals["31-60"] || 0) +
        (payableAging.totals["61-90"] || 0) +
        (payableAging.totals["90+"] || 0),
      buckets: [
        { label: "Current (0-30)", amount: payableAging.totals.current || 0, risk: "low" },
        { label: "31-60 Days", amount: payableAging.totals["1-30"] || 0, risk: "medium" },
        { label: "61-90 Days", amount: payableAging.totals["31-60"] || 0, risk: "high" },
        { label: "91-120 Days", amount: payableAging.totals["61-90"] || 0, risk: "critical" },
        { label: "120+ Days", amount: payableAging.totals["90+"] || 0, risk: "critical" },
      ],
    };

    // Calculate real liquid cash from balance sheet ledger accounts
    const cashAccounts = Object.values(allTimeJournalReport.asset?.accounts || {})
      .filter((a: any) =>
        a.accountType === "asset_cash" ||
        a.name?.toLowerCase().includes("cash") ||
        a.name?.toLowerCase().includes("bank")
      );
    const totalLiquidCash = cashAccounts.reduce((sum: number, a: any) => sum + (a.amount || 0), 0);
    const effectiveCash = totalLiquidCash > 0 ? totalLiquidCash : allTimeCash.net > 0 ? allTimeCash.net : 0;

    // Recent operational documents for activity streams
    const [Expense, StockTransfer] = await Promise.all([
      import("@/models/finance/Expense").then((m) => m.default),
      import("@/models/inventory/StockTransfer").then((m) => m.default),
    ]);

    const [recentBills, recentInvoices, recentExpenses, recentReturns] = await Promise.all([
      Invoice.find({ moveType: "in_invoice", tenantId })
        .populate("partnerId", "header.name")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Invoice.find({ moveType: "out_invoice", tenantId })
        .populate("partnerId", "header.name")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      Expense.find({ tenantId })
        .populate("employeeId", "name")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
      StockTransfer.find({
        tenantId,
        $or: [
          { "header.name": { $regex: /RET/i } },
          { "header.sourceDocument": { $exists: true, $ne: "" } },
        ],
      })
        .populate("header.partnerId", "header.name")
        .sort({ createdAt: -1 })
        .limit(5)
        .lean(),
    ]);

    // Helper for percentage change
    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    // Authentic Financial Matrices from Balance Sheet and Income Statement
    const totalCurrentAssets = Object.values(allTimeJournalReport.asset?.accounts || {})
      .filter((a: any) => a.accountType === "asset_cash" || a.accountType === "asset_current")
      .reduce((s: number, a: any) => s + (a.amount || 0), 0) + receivables.total;

    const totalCurrentLiabilities = Object.values(allTimeJournalReport.liability?.accounts || {})
      .filter((a: any) => a.accountType === "liability_current")
      .reduce((s: number, a: any) => s + (a.amount || 0), 0) + payables.total;

    const workingCapital = Math.round(receivables.total - payables.total);
    const currentRatio =
      totalCurrentLiabilities > 0
        ? Number((totalCurrentAssets / totalCurrentLiabilities).toFixed(2))
        : payables.total > 0
          ? Number((receivables.total / payables.total).toFixed(2))
          : null;
    const quickRatio =
      totalCurrentLiabilities > 0
        ? Number(((effectiveCash + receivables.total) / totalCurrentLiabilities).toFixed(2))
        : payables.total > 0
          ? Number(((effectiveCash + receivables.total) / payables.total).toFixed(2))
          : null;
    const hasRecordedCosts = allTimeExpenses > 0;
    const profitAvailable = allTimeRevenue > 0 && hasRecordedCosts;
    const profitMargin = profitAvailable
      ? Number(((allTimeNetIncome / allTimeRevenue) * 100).toFixed(1))
      : null;
    const profitStatus = (allTimeRevenue > 0 && !hasRecordedCosts)
      ? "incomplete"
      : profitAvailable
        ? "available"
        : "unavailable";
    const profitUnavailableReason = (allTimeRevenue > 0 && !hasRecordedCosts)
      ? "Cost of goods sold and operating expenses have not been posted to the general ledger"
      : !profitAvailable
        ? "Revenue and expense records are not yet available"
        : undefined;

    const avgCollectionPeriod =
      allTimeRevenue > 0
        ? Math.round(receivables.total / (allTimeRevenue / 180))
        : 0;
    const payablesTurnover =
      allTimeExpenses > 0
        ? Number((allTimeExpenses / (payables.total || 1)).toFixed(2))
        : 0;
    const monthlyBurn = allTimeExpenses > 0 ? Math.round(allTimeExpenses / 6) : 0;
    const runwayAvailable = monthlyBurn > 0 && effectiveCash > 0;
    const cashRunway = runwayAvailable ? Number((effectiveCash / monthlyBurn).toFixed(1)) : null;
    const cashRunwayStatus = runwayAvailable ? "available" : "unavailable";
    const cashRunwayReason = !runwayAvailable
      ? (monthlyBurn === 0 && effectiveCash === 0
          ? "No liquid cash or historical expense burn recorded"
          : monthlyBurn === 0
            ? "Insufficient historical expense burn to calculate runway"
            : "No liquid cash reserves available")
      : undefined;
    const ebitda = profitAvailable ? allTimeNetIncome : null;
    const operatingMargin = profitMargin;


    // Authentic Expense Breakdown from posted ledger accounts
    const rawExpenseAccounts = Object.values(allTimeJournalReport.expense?.accounts || {});
    const expenseBreakdown = rawExpenseAccounts
      .filter((a: any) => (a.amount || 0) > 0 || (a.debit || 0) > 0)
      .map((a: any) => ({
        name: a.name || a.code || "Operating Cost",
        value: Math.round(Math.abs(a.amount || a.debit || 0)),
      }))
      .sort((a, b) => b.value - a.value);

    // Monthly Performance series from posted entries
    const formattedMonthlySeries = (monthlySeries && monthlySeries.length > 0)
      ? monthlySeries.map((item) => ({
          date: item.date,
          revenue: item.revenue,
          expenses: item.expenses,
          value: item.revenue,
          net: item.revenue - item.expenses,
        }))
      : [];

    // Daily timeline for TradingLineChart from posted cash flow
    const revenueTimeline = (dailyCashSeries && dailyCashSeries.length > 0)
      ? dailyCashSeries.map((item) => ({
          date: item.date,
          value: item.inflow > 0 ? item.inflow : item.net > 0 ? item.net : 0,
          inflow: item.inflow,
          outflow: item.outflow,
          net: item.net,
        }))
      : [];

    const payload = {
      summary: {
        revenue: {
          current: allTimeRevenue,
          previous: prevRevenue,
          monthToDate: m30Revenue,
          change: calcChange(m30Revenue, prevRevenue),
        },
        expenses: {
          current: allTimeExpenses,
          previous: prevExpenses,
          monthToDate: m30Expenses,
          change: calcChange(m30Expenses, prevExpenses),
        },
        netIncome: {
          current: allTimeNetIncome,
          previous: prevNetIncome,
          monthToDate: m30NetIncome,
          change: calcChange(m30NetIncome, prevNetIncome),
        },
        cashFlow: {
          current: effectiveCash,
          previous: prevCashFlow,
          change: calcChange(currentCashFlow, prevCashFlow),
        },
        accountsReceivable: receivables,
        accountsPayable: payables,
        matrices: {
          workingCapital,
          currentRatio,
          quickRatio,
          profitMargin,
          operatingMargin,
          profitStatus,
          profitUnavailableReason,
          cashRunway,
          cashRunwayStatus,
          cashRunwayReason,
          ebitda,
          avgCollectionPeriod,
          payablesTurnover,
          effectiveCash,
        },
        expenseBreakdown,
        monthlyPerformance: formattedMonthlySeries,
        revenueTimeline,
        recentTransactions: {
          bills: recentBills.map((b: any) => ({
            _id: b._id,
            name: b.name,
            partner: b.partnerId?.header?.name || "N/A",
            amount: b.amountTotal,
            state: b.state,
            date: b.invoiceDate,
          })),
          invoices: recentInvoices.map((i: any) => ({
            _id: i._id,
            name: i.name,
            partner: i.partnerId?.header?.name || "N/A",
            amount: i.amountTotal,
            state: i.state,
            date: i.invoiceDate,
          })),
          expenses: recentExpenses.map((e: any) => ({
            _id: e._id,
            name: e.description || "Expense",
            employee: e.employeeId?.name || "N/A",
            amount: e.total,
            status: e.status,
            date: e.expenseDate || e.createdAt,
          })),
          returns: recentReturns.map((r: any) => ({
            _id: r._id,
            name: r.header?.name || "Return",
            partner: r.header?.partnerId?.header?.name || "N/A",
            status: r.status,
            date: r.header?.scheduledDate || r.createdAt,
          })),
        },
      },
    };
    setCachedData(cacheKey, payload, 20_000);
    return NextResponse.json(payload);
  } catch (error: any) {
    console.error("Finance summary error:", error);
    return NextResponse.json({ error: safeInternalErrorMessage() }, { status: 500 });
  }
}
