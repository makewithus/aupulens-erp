import { NextResponse } from "next/server";
import { requireTenantId } from "@/lib/auth/requireTenantId";
import { auth } from "@/auth";
import connectDB from "@/lib/db";
import Invoice from "@/models/Invoice";
import {
  buildAgedPartnerReport,
  buildPostedCashFlowTotals,
  buildPostedJournalReport,
} from "@/lib/accounting/reports";

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

    // Get date ranges for current and previous month
    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    const [
      currentJournalReport,
      prevJournalReport,
      currentCash,
      prevCash,
      receivableAging,
      payableAging,
    ] = await Promise.all([
      buildPostedJournalReport({
        tenantId,
        startDate: currentMonthStart,
      }),
      buildPostedJournalReport({
        tenantId,
        startDate: prevMonthStart,
        endDate: prevMonthEnd,
      }),
      buildPostedCashFlowTotals({
        tenantId,
        startDate: currentMonthStart,
      }),
      buildPostedCashFlowTotals({
        tenantId,
        startDate: prevMonthStart,
        endDate: prevMonthEnd,
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
    ]);

    const currentRevenue = currentJournalReport.income.total;
    const prevRevenue = prevJournalReport.income.total;
    const currentExpenses = currentJournalReport.expense.total;
    const prevExpenses = prevJournalReport.expense.total;
    const currentCashFlow = currentCash.net;
    const prevCashFlow = prevCash.net;

    const receivables = {
      total: receivableAging.totals.total,
      overdue:
        receivableAging.totals["1-30"] +
        receivableAging.totals["31-60"] +
        receivableAging.totals["61-90"] +
        receivableAging.totals["90+"],
    };

    const payables = {
      total: payableAging.totals.total,
      overdue:
        payableAging.totals["1-30"] +
        payableAging.totals["31-60"] +
        payableAging.totals["61-90"] +
        payableAging.totals["90+"],
    };

    // Recent operational documents are still shown for activity context, while
    // financial KPIs above are computed from posted ledger entries.
    const recentBills = await Invoice.find({
      moveType: "in_invoice",
      tenantId,
    })
      .populate("partnerId", "header.name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const recentInvoices = await Invoice.find({
      moveType: "out_invoice",
      tenantId,
    })
      .populate("partnerId", "header.name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // Helper for percentage change
    const calcChange = (curr: number, prev: number) => {
      if (prev === 0) return curr > 0 ? 100 : 0;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    const currentNetIncome = currentRevenue - currentExpenses;
    const prevNetIncome = prevRevenue - prevExpenses;

    const Expense = (await import("@/models/Expense")).default;
    const recentExpenses = await Expense.find({ tenantId })
      .populate("employeeId", "name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    const StockTransfer = (await import("@/models/StockTransfer")).default;
    const recentReturns = await StockTransfer.find({
      tenantId,
      $or: [
        { "header.name": { $regex: /RET/i } },
        { "header.sourceDocument": { $exists: true, $ne: "" } },
      ],
    })
      .populate("header.partnerId", "header.name")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean();

    // 5. Additional Financial Matrices
    const workingCapital = receivables.total - payables.total;
    const currentRatio =
      payables.total > 0 ? receivables.total / payables.total : 0;
    const quickRatio = currentRatio; // Simplified - in real scenario, exclude inventory
    const profitMargin =
      currentRevenue > 0 ? (currentNetIncome / currentRevenue) * 100 : 0;
    const avgCollectionPeriod =
      currentRevenue > 0 ? receivables.total / (currentRevenue / 30) : 0;
    const payablesTurnover =
      currentExpenses > 0 ? currentExpenses / (payables.total || 1) : 0;

    return NextResponse.json({
      summary: {
        revenue: {
          current: currentRevenue,
          previous: prevRevenue,
          change: calcChange(currentRevenue, prevRevenue),
        },
        expenses: {
          current: currentExpenses,
          previous: prevExpenses,
          change: calcChange(currentExpenses, prevExpenses),
        },
        netIncome: {
          current: currentNetIncome,
          previous: prevNetIncome,
          change: calcChange(currentNetIncome, prevNetIncome),
        },
        cashFlow: {
          current: currentCashFlow,
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
          avgCollectionPeriod,
          payablesTurnover,
        },
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
    });
  } catch (error: any) {
    console.error("Finance summary error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
